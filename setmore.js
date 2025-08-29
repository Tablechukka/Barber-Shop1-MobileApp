export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle GET requests for testing
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Setmore API proxy is running',
      timestamp: new Date().toISOString()
    });
  }

  // Handle POST requests
  if (req.method === 'POST') {
    console.log('Proxy received request body:', req.body);
    const { apiKey, endpoint } = req.body;
    
    console.log('Extracted apiKey:', apiKey ? apiKey.substring(0, 20) + '...' : 'null');
    console.log('Extracted endpoint:', endpoint);
    
    if (!apiKey) {
      console.log('No apiKey found in request');
      return res.status(400).json({ error: 'API key is required' });
    }
    
    if (!endpoint) {
      console.log('No endpoint found in request');
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    
    // Map endpoints to correct Setmore API URLs
    const endpointMap = {
      'services': '/api/v1/bookingapi/services',
      'staffs': '/api/v1/bookingapi/staffs',
      'customers': '/api/v1/bookingapi/customer',
      'appointments': '/api/v1/bookingapi/appointments'
    };
    
    if (!endpointMap[endpoint]) {
      return res.status(400).json({ error: 'Invalid endpoint' });
    }
    
    // Build URL with query parameters for appointments
    let url = `https://developer.setmore.com${endpointMap[endpoint]}`;
    
    // Add required parameters for appointments endpoint
    if (endpoint === 'appointments') {
      const today = new Date();
      const startDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      const endDate = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now
      
      const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };
      
      url += `?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&customerDetails=true`;
    }
    
    console.log(`Proxying request to: ${url}`);
    
    fetch(url, {
      method: 'GET', // Setmore API uses GET for these endpoints
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'BarberShop-Dashboard/1.0'
      }
    })
    .then(response => {
      console.log(`Response status: ${response.status}`);
      if (!response.ok) {
        return response.text().then(data => {
          return res.status(response.status).json({ 
            error: `API Error: ${response.status} ${response.statusText}`,
            details: data
          });
        });
      }
      return response.text();
    })
    .then(data => {
      // Try to parse JSON, fallback to text if needed
      let jsonData;
      try {
        jsonData = JSON.parse(data);
      } catch (e) {
        jsonData = { raw: data };
      }
      
      return res.status(200).json(jsonData);
    })
    .catch(error => {
      console.error('Proxy error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
      });
    });
    
    return; // Important: return early to prevent fallback
  }

  // Handle unsupported methods
  return res.status(405).json({ error: 'Method not allowed' });
}
