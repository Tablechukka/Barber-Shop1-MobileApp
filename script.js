// Setmore API Configuration
const SETMORE_API_BASE = 'https://api.setmore.com/v1';

// Global variables
let dashboardData = null;
let charts = {};
let webhookEnabled = false;
let webhookInterval = null;
let activityFeed = [];
let demoMode = false;

// NEW: Token management variables
let accessToken = null;
let refreshToken = null;
let tokenExpiryTime = null;
let isAutoLoading = false;
let isRefreshingToken = false; // NEW: Prevent multiple simultaneous token refreshes
let tokenRefreshPromise = null; // NEW: Cache the refresh promise

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    // Load cached tokens if available
    loadCachedTokens();
    
    // Load webhook status
    webhookEnabled = localStorage.getItem('webhook_enabled') === 'true';
    updateWebhookButton();
    
    // Add demo button
    addDemoButton();
    
    // NEW: Auto-load dashboard if we have valid tokens
    autoLoadDashboard();
});

// NEW: Load cached tokens from localStorage
function loadCachedTokens() {
    accessToken = localStorage.getItem('setmore_access_token');
    refreshToken = localStorage.getItem('setmore_refresh_token');
    tokenExpiryTime = localStorage.getItem('setmore_token_expiry');
    
    // Also load the old API key format for backward compatibility
    const cachedApiKey = localStorage.getItem('setmore_api_key');
    if (cachedApiKey && !accessToken) {
        accessToken = cachedApiKey;
        document.getElementById('apiKey').value = cachedApiKey;
    }
    
    if (accessToken) {
        document.getElementById('apiKey').value = accessToken;
    }
}

// NEW: Save tokens to localStorage
function saveTokens(newAccessToken, newRefreshToken = null, expiryTime = null) {
    accessToken = newAccessToken;
    if (newRefreshToken) {
        refreshToken = newRefreshToken;
    }
    if (expiryTime) {
        tokenExpiryTime = expiryTime;
    }
    
    localStorage.setItem('setmore_access_token', accessToken);
    if (refreshToken) {
        localStorage.setItem('setmore_refresh_token', refreshToken);
    }
    if (tokenExpiryTime) {
        localStorage.setItem('setmore_token_expiry', tokenExpiryTime);
    }
    
    // Update the input field
    document.getElementById('apiKey').value = accessToken;
}

// NEW: Check if token is expired or about to expire (within 5 minutes)
function isTokenExpired() {
    if (!tokenExpiryTime) return false;
    
    const now = Date.now();
    const expiryTime = parseInt(tokenExpiryTime);
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return now >= (expiryTime - fiveMinutes);
}

// NEW: Refresh access token using refresh token
async function refreshAccessToken() {
    if (!refreshToken) {
        throw new Error('No refresh token available. Please re-authenticate with Setmore.');
    }
    
    // NEW: If already refreshing, wait for the existing refresh to complete
    if (isRefreshingToken && tokenRefreshPromise) {
        console.log('Token refresh already in progress, waiting...');
        return await tokenRefreshPromise;
    }
    
    console.log('Refreshing access token...');
    console.log('Using refresh token:', refreshToken);
    
    // NEW: Set refresh flag and create promise
    isRefreshingToken = true;
    tokenRefreshPromise = performTokenRefresh();
    
    try {
        const result = await tokenRefreshPromise;
        return result;
    } finally {
        // NEW: Clear refresh state
        isRefreshingToken = false;
        tokenRefreshPromise = null;
    }
}

// NEW: Separate function for actual token refresh logic
async function performTokenRefresh() {
    try {
        // Try POST method with refresh token in body first
        let response = await fetch('https://developer.setmore.com/api/v1/o/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
        
        // If POST fails, try GET method with query parameter
        if (!response.ok) {
            console.log('POST method failed, trying GET method...');
            response = await fetch(`https://developer.setmore.com/api/v1/o/oauth2/token?refreshToken=${refreshToken}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Token refresh API Error Response:', errorText);
            throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Token refresh response:', data);
        console.log('Token refresh response structure:', JSON.stringify(data, null, 2));
        
        // Handle different response formats
        let accessToken, newRefreshToken, expiresIn;
        
        console.log('Checking response format...');
        console.log('data.response:', data.response);
        console.log('data.data:', data.data);
        console.log('data.data.access_token:', data.data?.access_token);
        console.log('data.data.token:', data.data?.token);
        console.log('data.data.token.access_token:', data.data?.token?.access_token);
        
        if (data.response && data.data && data.data.access_token) {
            console.log('Using Format 1');
            accessToken = data.data.access_token;
            newRefreshToken = data.data.refresh_token || refreshToken;
            expiresIn = data.data.expires_in || 604800;
        } else if (data.access_token) {
            console.log('Using Format 2');
            accessToken = data.access_token;
            newRefreshToken = data.refresh_token || refreshToken;
            expiresIn = data.expires_in || 604800;
        } else if (data.data && data.data.access_token) {
            console.log('Using Format 3');
            accessToken = data.data.access_token;
            newRefreshToken = data.data.refresh_token || refreshToken;
            expiresIn = data.data.expires_in || 604800;
        } else if (data.response && data.data && data.data.token && data.data.token.access_token) {
            console.log('Using Format 4');
            accessToken = data.data.token.access_token;
            newRefreshToken = data.data.token.refresh_token || refreshToken;
            expiresIn = data.data.token.expires_in || 604800;
        } else {
            console.error('Unexpected token refresh response format:', data);
            throw new Error('Invalid token refresh response format - no access_token found');
        }
        
        // Calculate expiry time (current time + expires_in seconds)
        const expiryTime = Date.now() + (expiresIn * 1000);
        
        // Save the new tokens
        saveTokens(accessToken, newRefreshToken, expiryTime.toString());
        
        console.log('Access token refreshed successfully');
        return accessToken;
        
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

// NEW: Get valid access token (refresh if needed)
async function getValidAccessToken() {
    if (!accessToken) {
        throw new Error('No access token available. Please enter your Setmore API credentials.');
    }
    
    // Check if token is expired or about to expire
    if (isTokenExpired()) {
        console.log('Token expired or expiring soon, refreshing...');
        try {
            return await refreshAccessToken();
        } catch (error) {
            console.error('Failed to refresh token:', error);
            // Clear invalid tokens
            clearTokens();
            throw new Error('Token refresh failed. Please re-authenticate with Setmore.');
        }
    }
    
    return accessToken;
}

// NEW: Clear all tokens
function clearTokens() {
    accessToken = null;
    refreshToken = null;
    tokenExpiryTime = null;
    
    localStorage.removeItem('setmore_access_token');
    localStorage.removeItem('setmore_refresh_token');
    localStorage.removeItem('setmore_token_expiry');
    localStorage.removeItem('setmore_api_key');
    
    document.getElementById('apiKey').value = '';
    document.getElementById('refreshTokenInput').value = '';
    
    console.log('All tokens cleared successfully');
    alert('✅ All tokens cleared! You can now set up fresh credentials.');
}

// NEW: Auto-load dashboard if we have valid tokens
async function autoLoadDashboard() {
    if (isAutoLoading) return; // Prevent multiple simultaneous loads
    
    try {
        const validToken = await getValidAccessToken();
        if (validToken) {
            console.log('Auto-loading dashboard with valid token...');
            isAutoLoading = true;
            await loadDashboardWithToken(validToken);
        }
    } catch (error) {
        console.log('Auto-load failed:', error.message);
        // Don't show error for auto-load failures, just log them
    } finally {
        isAutoLoading = false;
    }
}

// NEW: Load dashboard with a specific token
async function loadDashboardWithToken(token) {
    // Save the token first
    saveTokens(token);
    
    showLoading();
    hideError();
    hideDashboard();

    try {
        // Fetch all data from Setmore API
        const data = await fetchAllDataWithToken(token);
        
        // Process and cache data
        dashboardData = processData(data);
        localStorage.setItem('dashboard_data', JSON.stringify(dashboardData));
        localStorage.setItem('data_timestamp', Date.now());
        
        // Render dashboard
        renderDashboard();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError(error.message || 'Failed to load data from Setmore API');
    }
}

// NEW: Fetch all data with a specific token
async function fetchAllDataWithToken(token) {
    // Fetch data in parallel for better performance
    const [customers, appointments, services, staff] = await Promise.all([
        fetchWithProxyAndToken('customers', token),
        fetchWithProxyAndToken('appointments', token),
        fetchWithProxyAndToken('services', token),
        fetchWithProxyAndToken('staffs', token)
    ]);

    return { customers, appointments, services, staff };
}

// NEW: Fetch data via proxy with token
async function fetchWithProxyAndToken(endpoint, token, retries = 3) {
    console.log(`Attempting to fetch via proxy: ${endpoint}`);
    console.log(`Using token: ${token ? token.substring(0, 20) + '...' : 'null'}`);
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const requestBody = {
                endpoint: endpoint,
                apiKey: token
            };
            console.log(`Sending to proxy:`, requestBody);
            
            const response = await fetch('/api/setmore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            console.log(`Proxy response status: ${response.status}`);
            
            if (response.status === 401) {
                // NEW: If we get 401, try to refresh the token and retry once
                console.log('Got 401, attempting to refresh token...');
                try {
                    const newToken = await refreshAccessToken();
                    console.log('Token refreshed, retrying with new token...');
                    
                    // Retry with the new token
                    const retryRequestBody = {
                        endpoint: endpoint,
                        apiKey: newToken
                    };
                    console.log(`Retry sending to proxy:`, retryRequestBody);
                    
                    const retryResponse = await fetch('/api/setmore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(retryRequestBody)
                    });
                    
                    if (retryResponse.ok) {
                        const retryData = await retryResponse.json();
                        console.log(`Proxy Response data:`, retryData);
                        
                        if (retryData.response && retryData.data) {
                            console.log('Using data.data from Setmore format');
                            return retryData.data;
                        } else if (retryData.data) {
                            console.log('Using data.data from Setmore format');
                            return retryData.data;
                        } else {
                            console.log('Using response directly');
                            return retryData;
                        }
                    } else {
                        const errorData = await retryResponse.json();
                        console.log(`Proxy Error Response:`, errorData);
                        throw new Error(`API Error: ${retryResponse.status} ${retryResponse.statusText}`);
                    }
                } catch (refreshError) {
                    console.error('Failed to refresh token:', refreshError);
                    // Continue with normal error handling
                }
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                console.log(`Proxy Error Response:`, errorData);
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`Proxy Response data:`, data);
            
            if (data.response && data.data) {
                console.log('Using data.data from Setmore format');
                return data.data;
            } else if (data.data) {
                console.log('Using data.data from Setmore format');
                return data.data;
            } else {
                console.log('Using response directly');
                return data;
            }
            
        } catch (error) {
            console.log(`Proxy fetch attempt ${attempt} failed:`, error);
            
            if (attempt === retries) {
                throw new Error('Invalid API key. Please check your Setmore API credentials.');
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Add demo button to the interface (removed since it's already in HTML)
function addDemoButton() {
    // Demo button is already in the HTML, no need to add it dynamically
    console.log('Demo button already exists in HTML');
}

// Simple test function
function testDemo() {
    console.log('Test demo function called');
    alert('Demo function is working!');
}

// NEW: Set up refresh token (call this once with your refresh token)
async function setupRefreshToken(refreshTokenValue) {
    if (!refreshTokenValue || refreshTokenValue.trim() === '') {
        alert('Please provide a valid refresh token');
        return;
    }
    
    // Clear any old expired tokens first
    clearTokens();
    
    refreshToken = refreshTokenValue.trim();
    localStorage.setItem('setmore_refresh_token', refreshToken);
    
    console.log('Refresh token saved successfully');
    
    try {
        // Immediately refresh the access token
        console.log('Refreshing access token with new refresh token...');
        const newAccessToken = await refreshAccessToken();
        
        alert('✅ Refresh token saved and access token refreshed! The dashboard will now automatically refresh your access token when needed.');
        
        // Try to auto-load the dashboard with the new token
        await autoLoadDashboard();
        
    } catch (error) {
        console.error('Failed to refresh access token:', error);
        alert('⚠️ Refresh token saved, but failed to refresh access token. Please check your refresh token and try again.');
    }
}

// NEW: Test API connection function
async function testApiConnection() {
    try {
        // Get a valid access token (refresh if needed)
        const validToken = await getValidAccessToken();
        
        console.log('Testing API connection via proxy...');
        showLoading();
        
        try {
            // Test the proxy first
            console.log('Testing proxy connectivity...');
            
            const proxyTest = await fetch('/api/setmore');
            if (!proxyTest.ok) {
                throw new Error('Proxy service is not available');
            }
            
            console.log('Proxy is working, testing Setmore API...');
            
            // Test different endpoints through our proxy
            const testEndpoints = ['customers', 'appointments', 'services', 'staffs'];
            
            for (const endpoint of testEndpoints) {
                try {
                    console.log(`Testing endpoint: ${endpoint}`);
                    
                    const response = await fetch('/api/setmore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            apiKey: validToken,
                            endpoint: endpoint
                        })
                    });
                    
                    console.log(`Response for ${endpoint}:`, response.status, response.statusText);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`Success! Data from ${endpoint}:`, data);
                        alert(`✅ API connection successful!\nEndpoint: ${endpoint}\nStatus: ${response.status}\nCheck console for details.`);
                        hideLoading();
                        return;
                    } else {
                        const errorData = await response.json();
                        console.log(`Failed for ${endpoint}:`, response.status, errorData);
                    }
                } catch (error) {
                    console.error(`Error testing ${endpoint}:`, error);
                }
            }
            
            // If we get here, all endpoints failed
            throw new Error('All API endpoints failed. Check console for detailed error information.');
            
        } catch (error) {
            console.error('API test failed:', error);
            alert(`❌ API test failed:\n${error.message}\n\nCheck the browser console for detailed error information.`);
        } finally {
            hideLoading();
        }
        
    } catch (error) {
        console.error('Token validation failed:', error);
        alert(`❌ Token validation failed:\n${error.message}\n\nPlease check your API credentials or refresh token.`);
    }
}

// Load demo data
function loadDemoData() {
    console.log('Demo button clicked!');
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded!');
        showError('Chart.js library not loaded. Please refresh the page.');
        return;
    }
    
    demoMode = true;
    showLoading();
    hideError();
    hideDashboard();
    
    console.log('Generating demo data...');
    
    // Simulate loading time
    setTimeout(() => {
        try {
            console.log('Creating demo data...');
            dashboardData = generateDemoData();
            console.log('Demo data created:', dashboardData);
            
            localStorage.setItem('demo_data', JSON.stringify(dashboardData));
            console.log('Demo data saved to localStorage');
            
            renderDashboard();
            console.log('Dashboard rendered');
            
            addActivityMessage('Demo data loaded successfully', 'success');
            console.log('Demo complete!');
        } catch (error) {
            console.error('Error in demo:', error);
            showError('Demo failed to load: ' + error.message);
        }
    }, 2000);
}

// Generate realistic demo data
function generateDemoData() {
    const customers = [
        { id: '1', name: 'John Smith', email: 'john@email.com' },
        { id: '2', name: 'Mike Johnson', email: 'mike@email.com' },
        { id: '3', name: 'David Wilson', email: 'david@email.com' },
        { id: '4', name: 'James Brown', email: 'james@email.com' },
        { id: '5', name: 'Robert Davis', email: 'robert@email.com' },
        { id: '6', name: 'William Miller', email: 'william@email.com' },
        { id: '7', name: 'Richard Garcia', email: 'richard@email.com' },
        { id: '8', name: 'Joseph Martinez', email: 'joseph@email.com' },
        { id: '9', name: 'Thomas Anderson', email: 'thomas@email.com' },
        { id: '10', name: 'Christopher Taylor', email: 'chris@email.com' }
    ];

    const services = [
        { id: '1', name: 'Haircut & Style', price: 35 },
        { id: '2', name: 'Beard Trim', price: 15 },
        { id: '3', name: 'Haircut + Beard', price: 45 },
        { id: '4', name: 'Kids Haircut', price: 25 },
        { id: '5', name: 'Senior Haircut', price: 30 },
        { id: '6', name: 'Hair Wash & Style', price: 20 },
        { id: '7', name: 'Hair Coloring', price: 75 },
        { id: '8', name: 'Hair Treatment', price: 40 }
    ];

    const staff = [
        { id: '1', name: 'Tony Rodriguez' },
        { id: '2', name: 'Carlos Martinez' },
        { id: '3', name: 'Miguel Hernandez' }
    ];

    // Generate realistic appointments
    const appointments = [];
    const statuses = ['completed', 'confirmed', 'cancelled', 'no-show'];
    const statusWeights = [0.7, 0.2, 0.08, 0.02]; // 70% completed, 20% confirmed, etc.

    // Generate appointments for the last 3 months
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    for (let i = 0; i < 150; i++) {
        const randomDate = new Date(startDate.getTime() + Math.random() * (Date.now() - startDate.getTime()));
        const randomHour = 8 + Math.floor(Math.random() * 10); // 8 AM to 6 PM
        const randomMinute = Math.floor(Math.random() * 4) * 15; // 15-minute intervals
        
        randomDate.setHours(randomHour, randomMinute, 0, 0);
        
        const customer = customers[Math.floor(Math.random() * customers.length)];
        const service = services[Math.floor(Math.random() * services.length)];
        const staffMember = staff[Math.floor(Math.random() * staff.length)];
        
        // Weighted random status
        const random = Math.random();
        let statusIndex = 0;
        let cumulative = 0;
        for (let j = 0; j < statusWeights.length; j++) {
            cumulative += statusWeights[j];
            if (random <= cumulative) {
                statusIndex = j;
                break;
            }
        }
        
        appointments.push({
            id: i + 1,
            customer_id: customer.id,
            service_id: service.id,
            staff_id: staffMember.id,
            start_time: randomDate.toISOString(),
            status: statuses[statusIndex],
            price: service.price,
            // NEW: Add booking time (simulate realistic booking patterns)
            booking_time: new Date(randomDate.getTime() - (Math.random() * 30 + 1) * 24 * 60 * 60 * 1000).toISOString()
        });
    }

    return {
        customers: customers,
        appointments: appointments,
        services: services,
        staff: staff,
        stats: processDemoStats(appointments, customers, services, staff),
        customerMap: new Map(customers.map(c => [c.id, c]))
    };
}

// Process demo statistics
function processDemoStats(appointments, customers, services, staff) {
    const stats = {
        total: appointments.length,
        byCustomer: {},
        byService: {},
        byStaff: {},
        byHour: {},
        byDay: {},
        byWeek: {},
        byStatus: {},
        byMonth: {},
        revenue: 0,
        // NEW: Calendar insights
        leadTimes: [],
        bookingDates: [],
        seasonalData: {},
        lastMinuteBookings: 0,
        advancedBookings: 0
    };

    appointments.forEach(appointment => {
        // Count by customer
        stats.byCustomer[appointment.customer_id] = (stats.byCustomer[appointment.customer_id] || 0) + 1;
        
        // Count by service
        stats.byService[appointment.service_id] = (stats.byService[appointment.service_id] || 0) + 1;
        
        // Count by staff
        stats.byStaff[appointment.staff_id] = (stats.byStaff[appointment.staff_id] || 0) + 1;
        
        // Count by status
        stats.byStatus[appointment.status] = (stats.byStatus[appointment.status] || 0) + 1;
        
        // Count by hour
        const appointmentDate = new Date(appointment.start_time);
        const hour = appointmentDate.getHours();
        stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
        
        // Count by day of week
        const dayOfWeek = appointmentDate.getDay();
        stats.byDay[dayOfWeek] = (stats.byDay[dayOfWeek] || 0) + 1;
        
        // Count by week
        const weekStart = getWeekStart(appointmentDate);
        const weekKey = weekStart.toISOString().split('T')[0];
        stats.byWeek[weekKey] = (stats.byWeek[weekKey] || 0) + 1;
        
        // Count by month
        const monthKey = appointmentDate.toISOString().slice(0, 7);
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
        
        // Calculate revenue
        stats.revenue += appointment.price;

        // NEW: Calendar insights calculations
        const bookingDate = new Date(appointment.booking_time || appointment.start_time);
        const appointmentDate2 = new Date(appointment.start_time);
        
        // Calculate lead time (days between booking and appointment)
        const leadTimeDays = Math.ceil((appointmentDate2 - bookingDate) / (1000 * 60 * 60 * 24));
        stats.leadTimes.push(leadTimeDays);
        
        // Track booking dates for seasonal analysis
        stats.bookingDates.push(bookingDate);
        
        // Categorize booking timing
        if (leadTimeDays <= 1) {
            stats.lastMinuteBookings++;
        } else if (leadTimeDays >= 7) {
            stats.advancedBookings++;
        }
        
        // Seasonal data (by month)
        const bookingMonth = bookingDate.getMonth();
        stats.seasonalData[bookingMonth] = (stats.seasonalData[bookingMonth] || 0) + 1;
    });

    return stats;
}

// Main function to load dashboard
async function loadDashboard() {
    if (demoMode) {
        loadDemoData();
        return;
    }

    try {
        // Get a valid access token (refresh if needed)
        const validToken = await getValidAccessToken();
        
        // Load dashboard with the valid token
        await loadDashboardWithToken(validToken);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError(error.message || 'Failed to load data from Setmore API');
    }
}

// Fetch all data from Setmore API via proxy
async function fetchAllData(apiKey) {
    // Fetch data in parallel for better performance
    const [customers, appointments, services, staff] = await Promise.all([
        fetchWithProxy('customers', apiKey),
        fetchWithProxy('appointments', apiKey),
        fetchWithProxy('services', apiKey),
        fetchWithProxy('staffs', apiKey)
    ]);

    return { customers, appointments, services, staff };
}

// Fetch with proxy (new method to avoid CORS)
async function fetchWithProxy(endpoint, apiKey, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempting to fetch via proxy: ${endpoint}`);
            
            const response = await fetch('/api/setmore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    apiKey: apiKey,
                    endpoint: endpoint
                })
            });
            
            console.log(`Proxy response status: ${response.status}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Proxy Error Response:', errorData);
                
                if (response.status === 401) {
                    throw new Error('Invalid API key. Please check your Setmore API credentials.');
                } else if (response.status === 403) {
                    throw new Error('Access forbidden. Please check your API permissions.');
                } else if (response.status === 429) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                } else {
                    throw new Error(`API Error: ${response.status} - ${errorData.error || errorData.details || 'Unknown error'}`);
                }
            }
            
            const data = await response.json();
            console.log('Proxy Response data:', data);
            
            // Handle Setmore API response format
            let result;
            if (data.response && data.data) {
                // Setmore API format: {response: true, data: {...}}
                result = data.data;
                console.log('Using data.data from Setmore format');
            } else if (data.data) {
                // Fallback: just return data.data
                result = data.data;
                console.log('Using data.data from fallback');
            } else {
                // Fallback: return the whole response
                result = data;
                console.log('Using whole response as fallback');
            }
            
            console.log('Returning from fetchWithProxy:', result);
            return result;
            
        } catch (error) {
            console.error(`Proxy fetch attempt ${i + 1} failed:`, error);
            
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        }
    }
}

// Legacy fetch with retry logic (kept for compatibility)
async function fetchWithRetry(url, headers, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempting to fetch: ${url}`);
            console.log('Headers:', headers);
            
            const response = await fetch(url, { 
                headers,
                mode: 'cors' // Explicitly set CORS mode
            });
            
            console.log(`Response status: ${response.status}`);
            console.log(`Response headers:`, response.headers);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                
                if (response.status === 401) {
                    throw new Error('Invalid API key. Please check your Setmore API credentials.');
                } else if (response.status === 403) {
                    throw new Error('Access forbidden. Please check your API permissions.');
                } else if (response.status === 429) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                } else if (response.status === 0) {
                    throw new Error('CORS error: Unable to connect to Setmore API. This might be due to browser security restrictions. Try using a local server.');
                } else {
                    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
                }
            }
            
            const data = await response.json();
            console.log('API Response data:', data);
            return data.data || data; // Handle different response formats
            
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed:`, error);
            
            // Check for CORS errors specifically
            if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                throw new Error('CORS Error: Unable to connect to Setmore API from browser. This is likely due to browser security restrictions. Please try:\n1. Using a local development server\n2. Checking if Setmore API supports CORS\n3. Using a CORS proxy if needed');
            }
            
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        }
    }
}

// Process raw API data into dashboard format
function processData(data) {
    console.log('Processing data:', data);
    
    const { customers, appointments, services, staff } = data;
    
    console.log('Extracted data:', {
        customers: customers,
        appointments: appointments,
        services: services,
        staff: staff
    });
    
    // Process customers - handle Setmore API structure
    const customerMap = new Map();
    
    // Handle different customer data structures
    let customersArray = [];
    if (customers && Array.isArray(customers)) {
        customersArray = customers;
        console.log('Customers is direct array');
    } else if (customers && customers.customer && Array.isArray(customers.customer)) {
        // Setmore API returns {customer: [...]}
        customersArray = customers.customer;
        console.log('Customers from customer property');
    } else if (customers && customers.data && Array.isArray(customers.data)) {
        // Fallback: check for data property
        customersArray = customers.data;
        console.log('Customers from data property');
    } else if (customers && typeof customers === 'object' && Object.keys(customers).length === 0) {
        // Empty object returned - this might be normal for some Setmore accounts
        console.log('Empty customers object returned - this may be normal for your Setmore account');
        customersArray = [];
    } else {
        console.log('No valid customers array found, using empty array');
        console.log('Customers data structure:', customers);
    }
    
    // Process customers into map
    customersArray.forEach(customer => {
        if (customer && (customer.key || customer.id)) {
            customerMap.set(customer.key || customer.id, customer);
        }
    });
    
    // Process appointments with enhanced status tracking
    const appointmentStats = {
        total: 0,
        byCustomer: {},
        byService: {},
        byStaff: {},
        byHour: {},
        byDay: {},
        byWeek: {},
        byStatus: {},
        byMonth: {},
        revenue: 0
    };
    
    // Handle Setmore API appointments structure
    let appointmentsArray = [];
    if (appointments && Array.isArray(appointments)) {
        appointmentsArray = appointments;
    } else if (appointments && appointments.appointments && Array.isArray(appointments.appointments)) {
        // Setmore API returns {appointments: [...]}
        appointmentsArray = appointments.appointments;
    } else if (appointments && appointments.data && Array.isArray(appointments.data)) {
        // Fallback: check for data property
        appointmentsArray = appointments.data;
    }
    
    appointmentStats.total = appointmentsArray.length;
    
    appointmentsArray.forEach(appointment => {
        // Count by customer - Setmore uses customer_key
        const customerId = appointment.customer_key || appointment.customer_id;
        appointmentStats.byCustomer[customerId] = (appointmentStats.byCustomer[customerId] || 0) + 1;
        
        // Extract customer information from appointment if available
        if (appointment.customer && !customerMap.has(customerId)) {
            customerMap.set(customerId, appointment.customer);
        }
        
        // Count by service - Setmore uses service_key
        const serviceId = appointment.service_key || appointment.service_id;
        appointmentStats.byService[serviceId] = (appointmentStats.byService[serviceId] || 0) + 1;
        
        // Count by staff - Setmore uses staff_key
        const staffId = appointment.staff_key || appointment.staff_id;
        appointmentStats.byStaff[staffId] = (appointmentStats.byStaff[staffId] || 0) + 1;
        
        // Count by status - Setmore doesn't have status, default to 'completed'
        const status = appointment.status || 'completed';
        appointmentStats.byStatus[status] = (appointmentStats.byStatus[status] || 0) + 1;
        
        // Count by hour
        const appointmentDate = new Date(appointment.start_time);
        const hour = appointmentDate.getHours();
        appointmentStats.byHour[hour] = (appointmentStats.byHour[hour] || 0) + 1;
        
        // Count by day of week
        const dayOfWeek = appointmentDate.getDay();
        appointmentStats.byDay[dayOfWeek] = (appointmentStats.byDay[dayOfWeek] || 0) + 1;
        
        // Count by week
        const weekStart = getWeekStart(appointmentDate);
        const weekKey = weekStart.toISOString().split('T')[0];
        appointmentStats.byWeek[weekKey] = (appointmentStats.byWeek[weekKey] || 0) + 1;
        
        // Count by month
        const monthKey = appointmentDate.toISOString().slice(0, 7); // YYYY-MM
        appointmentStats.byMonth[monthKey] = (appointmentStats.byMonth[monthKey] || 0) + 1;
        
        // Calculate revenue (if pricing is available) - Setmore uses cost
        if (appointment.cost) {
            appointmentStats.revenue += parseFloat(appointment.cost);
        } else if (appointment.price) {
            appointmentStats.revenue += parseFloat(appointment.price);
        } else {
            // Estimate revenue based on service pricing
            const service = services.find(s => (s.key || s.id) === serviceId);
            if (service && (service.cost || service.price)) {
                appointmentStats.revenue += parseFloat(service.cost || service.price);
            }
        }
    });
    
    const result = {
        customers: customersArray,
        appointments: appointmentsArray,
        services: services && services.services ? services.services : (services && services.data ? services.data : (services || [])),
        staff: staff && staff.staffs ? staff.staffs : (staff && staff.data ? staff.data : (staff || [])),
        stats: appointmentStats,
        customerMap: customerMap
    };
    
    console.log('Processed data result:', result);
    return result;
}

// Get week start date
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// Render dashboard with charts
function renderDashboard() {
    hideLoading();
    showDashboard();
    
    // Destroy existing charts to prevent Canvas reuse errors
    destroyAllCharts();
    
    // Update summary cards
    updateSummaryCards();
    
    // Create charts
    createCustomersChart();
    createServicesChart();
    createHoursChart();
    createStaffChart();
    createRetentionChart();
    createWeeklyChart();
    
    // NEW: Create enhanced charts
    createStatusChart();
    createRevenueChart();
    createRosteringSuggestions();
    
    // NEW: Create calendar insights charts
    createLeadTimeChart();
    createPreferredDaysChart();
    createSeasonalChart();
    createBookingTimingChart();
    createMonthlyPatternsChart();
    createSchedulingInsights();
    
    // Initialize activity feed
    initializeActivityFeed();
    
    // Show demo notice if in demo mode
    if (demoMode) {
        showDemoNotice();
    }
}

// Destroy all existing charts to prevent Canvas reuse errors
function destroyAllCharts() {
    Object.values(charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    charts = {};
}

// Show demo notice
function showDemoNotice() {
    const notice = document.createElement('div');
    notice.className = 'demo-notice';
    notice.innerHTML = `
        <div class="demo-banner">
            <span>🎯 Demo Mode - Using sample data. Get Setmore Pro to connect your real data!</span>
            <button onclick="this.parentElement.parentElement.remove()" class="close-demo">×</button>
        </div>
    `;
    document.body.insertBefore(notice, document.body.firstChild);
}

// Update summary cards
function updateSummaryCards() {
    // Safety checks for missing data
    if (!dashboardData) {
        console.error('dashboardData is undefined');
        return;
    }
    
    const stats = dashboardData.stats || {};
    const customers = dashboardData.customers || [];
    const services = dashboardData.services || [];
    const staff = dashboardData.staff || [];
    
    console.log('Dashboard data structure:', {
        stats: stats,
        customers: customers,
        services: services,
        staff: staff
    });
    
    document.getElementById('totalAppointments').textContent = stats.total || 0;
    document.getElementById('totalCustomers').textContent = customers.length;
    document.getElementById('totalServices').textContent = services.length;
    document.getElementById('totalStaff').textContent = staff.length;
    
    // NEW: Revenue and success rate
    const revenue = stats.revenue || 0;
    document.getElementById('totalRevenue').textContent = revenue > 0 ? `$${revenue.toLocaleString()}` : 'N/A';
    
    const completed = stats.byStatus && stats.byStatus['completed'] ? stats.byStatus['completed'] : 0;
    const total = stats.total || 0;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('successRate').textContent = `${successRate}%`;

    // NEW: Calendar insights
    const leadTimes = stats.leadTimes || [];
    const avgLeadTime = leadTimes.length > 0 
        ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
        : 0;
    document.getElementById('avgLeadTime').textContent = `${avgLeadTime} days`;

    // Find peak day
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDay = stats.byDay || {};
    const peakDay = Object.entries(byDay)
        .sort(([,a], [,b]) => b - a)[0];
    const peakDayName = peakDay ? dayNames[parseInt(peakDay[0])] : 'N/A';
    document.getElementById('peakDay').textContent = peakDayName;

    // Last-minute booking rate
    const lastMinuteBookings = stats.lastMinuteBookings || 0;
    const lastMinuteRate = total > 0 ? Math.round((lastMinuteBookings / total) * 100) : 0;
    document.getElementById('lastMinuteRate').textContent = `${lastMinuteRate}%`;
}

// Create Most Frequent Customers Chart
function createCustomersChart() {
    const byCustomer = dashboardData.stats.byCustomer || {};
    
    // If no customer data available, show empty chart with message
    if (Object.keys(byCustomer).length === 0) {
        const ctx = document.getElementById('customersChart').getContext('2d');
        charts.customers = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Customer Data'],
                datasets: [{
                    label: 'Appointments',
                    data: [0],
                    backgroundColor: ['#718096'],
                    borderColor: ['#4a5568'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function() {
                                return 'Customer data not available from Setmore API';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
        return;
    }
    
    const customerStats = Object.entries(byCustomer)
        .map(([customerId, count]) => {
            const customer = dashboardData.customerMap.get(customerId);
            return {
                customer: customer || { 
                    first_name: 'Unknown Customer',
                    name: 'Unknown Customer'
                },
                count: count
            };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const ctx = document.getElementById('customersChart').getContext('2d');
    charts.customers = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: customerStats.map(item => {
                const customer = item.customer;
                // Handle Setmore API customer structure
                if (customer.first_name && customer.last_name) {
                    return `${customer.first_name} ${customer.last_name}`;
                } else if (customer.first_name) {
                    return customer.first_name;
                } else if (customer.name) {
                    return customer.name;
                } else {
                    return 'Unknown Customer';
                }
            }),
            datasets: [{
                label: 'Appointments',
                data: customerStats.map(item => item.count),
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Most Popular Services Chart
function createServicesChart() {
    const byService = dashboardData.stats.byService || {};
    const serviceStats = Object.entries(byService)
        .map(([serviceId, count]) => {
            // Handle Setmore API service structure - use key or id
            const service = dashboardData.services.find(s => (s.key || s.id) === serviceId) || { 
                service_name: 'Unknown Service',
                name: 'Unknown Service'
            };
            return { service, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const ctx = document.getElementById('servicesChart').getContext('2d');
    charts.services = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: serviceStats.map(item => {
                const service = item.service;
                // Handle Setmore API service structure
                return service.service_name || service.name || 'Unknown';
            }),
            datasets: [{
                data: serviceStats.map(item => item.count),
                backgroundColor: [
                    '#667eea', '#764ba2', '#f093fb', '#f5576c',
                    '#4facfe', '#00f2fe', '#43e97b', '#38f9d7'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20 }
                }
            }
        }
    });
}

// Create Busiest Hours Chart
function createHoursChart() {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourLabels = hours.map(h => `${h}:00`);
    const byHour = dashboardData.stats.byHour || {};
    const hourData = hours.map(h => byHour[h] || 0);

    const ctx = document.getElementById('hoursChart').getContext('2d');
    charts.hours = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hourLabels,
            datasets: [{
                label: 'Appointments',
                data: hourData,
                borderColor: 'rgba(118, 75, 162, 1)',
                backgroundColor: 'rgba(118, 75, 162, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Staff Performance Chart
function createStaffChart() {
    const byStaff = dashboardData.stats.byStaff || {};
    const staffStats = Object.entries(byStaff)
        .map(([staffId, count]) => {
            // Handle Setmore API staff structure - use key or id
            const staff = dashboardData.staff.find(s => (s.key || s.id) === staffId) || { 
                first_name: 'Unknown Staff',
                name: 'Unknown Staff'
            };
            return { staff, count };
        })
        .sort((a, b) => b.count - a.count);

    const ctx = document.getElementById('staffChart').getContext('2d');
    charts.staff = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: staffStats.map(item => {
                const staff = item.staff;
                // Handle Setmore API staff structure
                if (staff.first_name && staff.last_name) {
                    return `${staff.first_name} ${staff.last_name}`;
                } else if (staff.first_name) {
                    return staff.first_name;
                } else if (staff.name) {
                    return staff.name;
                } else {
                    return 'Unknown Staff';
                }
            }),
            datasets: [{
                label: 'Appointments',
                data: staffStats.map(item => item.count),
                backgroundColor: 'rgba(240, 147, 251, 0.8)',
                borderColor: 'rgba(240, 147, 251, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Customer Retention Chart
function createRetentionChart() {
    const byCustomer = dashboardData.stats.byCustomer || {};
    const customerAppointmentCounts = Object.values(byCustomer);
    const retentionData = {
        'One-time': customerAppointmentCounts.filter(count => count === 1).length,
        'Repeat (2-5)': customerAppointmentCounts.filter(count => count >= 2 && count <= 5).length,
        'Regular (6-10)': customerAppointmentCounts.filter(count => count >= 6 && count <= 10).length,
        'Loyal (10+)': customerAppointmentCounts.filter(count => count > 10).length
    };

    const ctx = document.getElementById('retentionChart').getContext('2d');
    charts.retention = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(retentionData),
            datasets: [{
                data: Object.values(retentionData),
                backgroundColor: [
                    '#f5576c', '#4facfe', '#43e97b', '#667eea'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20 }
                }
            }
        }
    });
}

// Create Weekly Trends Chart
function createWeeklyChart() {
    const byWeek = dashboardData.stats.byWeek || {};
    const weekStats = Object.entries(byWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8); // Last 8 weeks

    const ctx = document.getElementById('weeklyChart').getContext('2d');
    charts.weekly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weekStats.map(([week]) => `Week ${week}`),
            datasets: [{
                label: 'Appointments',
                data: weekStats.map(([, count]) => count),
                backgroundColor: 'rgba(67, 233, 123, 0.8)',
                borderColor: 'rgba(67, 233, 123, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// NEW: Create Appointment Status Chart
function createStatusChart() {
    const statusData = dashboardData.stats.byStatus || {};
    const statusLabels = Object.keys(statusData);
    const statusCounts = Object.values(statusData);
    
    // Color coding for different statuses
    const statusColors = {
        'completed': '#43e97b',
        'cancelled': '#f5576c',
        'no-show': '#f093fb',
        'confirmed': '#4facfe',
        'pending': '#ffd93d',
        'unknown': '#718096'
    };

    const ctx = document.getElementById('statusChart').getContext('2d');
    charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: statusLabels.map(status => status.charAt(0).toUpperCase() + status.slice(1)),
            datasets: [{
                data: statusCounts,
                backgroundColor: statusLabels.map(status => statusColors[status] || '#718096')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 15 }
                }
            }
        }
    });
}

// NEW: Create Revenue Trends Chart
function createRevenueChart() {
    const byMonth = dashboardData.stats.byMonth || {};
    const monthStats = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6); // Last 6 months

    const ctx = document.getElementById('revenueChart').getContext('2d');
    charts.revenue = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthStats.map(([month]) => {
                const date = new Date(month + '-01');
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }),
            datasets: [{
                label: 'Appointments',
                data: monthStats.map(([, count]) => count),
                borderColor: 'rgba(67, 233, 123, 1)',
                backgroundColor: 'rgba(67, 233, 123, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// NEW: Create Rostering Suggestions
function createRosteringSuggestions() {
    const container = document.getElementById('rosteringSuggestions');
    
    // Analyze peak hours and staff performance
    const byHour = dashboardData.stats.byHour || {};
    const peakHours = Object.entries(byHour)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));
    
    const byStaff = dashboardData.stats.byStaff || {};
    const staffPerformance = Object.entries(byStaff)
        .map(([staffId, count]) => {
            // Handle Setmore API staff structure - use key or id
            const staff = dashboardData.staff.find(s => (s.key || s.id) === staffId);
            return { staff, count, avgPerDay: Math.round(count / 30) }; // Assuming 30 days
        })
        .sort((a, b) => b.count - a.count);
    
    let html = '';
    
    // Peak hours recommendation
    html += `
        <div class="staff-suggestion">
            <h4>🕐 Peak Hours Analysis</h4>
            <div class="suggestion-details">
                Your busiest hours are: ${peakHours.map(h => `${h}:00`).join(', ')}<br>
                Consider scheduling more staff during these times.
            </div>
            <div class="recommendation">High Priority</div>
        </div>
    `;
    
    // Staff recommendations
    staffPerformance.forEach((item, index) => {
        const staff = item.staff;
        const avgPerDay = item.avgPerDay;
        
        // Handle Setmore API staff structure
        let staffName = 'Unknown Staff';
        if (staff) {
            if (staff.first_name && staff.last_name) {
                staffName = `${staff.first_name} ${staff.last_name}`;
            } else if (staff.first_name) {
                staffName = staff.first_name;
            } else if (staff.name) {
                staffName = staff.name;
            }
        }
        
        let recommendation = '';
        if (avgPerDay > 8) {
            recommendation = 'Consider reducing workload';
        } else if (avgPerDay < 3) {
            recommendation = 'Can handle more appointments';
        } else {
            recommendation = 'Optimal workload';
        }
        
        html += `
            <div class="staff-suggestion">
                <h4>👤 ${staffName}</h4>
                <div class="suggestion-details">
                    Total appointments: ${item.count}<br>
                    Average per day: ${avgPerDay}<br>
                    Recommendation: ${recommendation}
                </div>
                <div class="recommendation">${avgPerDay > 8 ? 'High' : avgPerDay < 3 ? 'Medium' : 'Optimal'}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// NEW: Initialize Activity Feed
function initializeActivityFeed() {
    const feed = document.getElementById('activityFeed');
    
    // Add initial message
    addActivityMessage('Dashboard loaded successfully', 'success');
    
    if (webhookEnabled) {
        addActivityMessage('Real-time updates enabled', 'info');
    }
    
    if (demoMode) {
        addActivityMessage('Demo mode active - using sample data', 'info');
    }
}

// NEW: Add activity message
function addActivityMessage(message, type = 'info') {
    const feed = document.getElementById('activityFeed');
    const time = new Date().toLocaleTimeString();
    
    const messageClass = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
    
    const feedItem = document.createElement('div');
    feedItem.className = `feed-item ${messageClass}`;
    feedItem.innerHTML = `
        <span class="feed-time">${time}</span>
        <span class="feed-message">${message}</span>
    `;
    
    feed.appendChild(feedItem);
    
    // Keep only last 10 messages
    const items = feed.querySelectorAll('.feed-item');
    if (items.length > 10) {
        items[0].remove();
    }
    
    // Scroll to bottom
    feed.scrollTop = feed.scrollHeight;
}

// NEW: Webhook Functions
function toggleWebhooks() {
    const modal = document.getElementById('webhookModal');
    modal.classList.remove('hidden');
}

function closeWebhookModal() {
    const modal = document.getElementById('webhookModal');
    modal.classList.add('hidden');
}

function toggleWebhookConnection() {
    webhookEnabled = !webhookEnabled;
    localStorage.setItem('webhook_enabled', webhookEnabled);
    
    updateWebhookButton();
    updateWebhookModal();
    
    if (webhookEnabled) {
        startWebhookSimulation();
        addActivityMessage('Real-time updates enabled', 'success');
    } else {
        stopWebhookSimulation();
        addActivityMessage('Real-time updates disabled', 'info');
    }
}

function updateWebhookButton() {
    const btn = document.getElementById('webhookBtn');
    if (webhookEnabled) {
        btn.textContent = '🔗 Webhooks Active';
        btn.classList.add('active');
    } else {
        btn.textContent = '🔗 Enable Webhooks';
        btn.classList.remove('active');
    }
}

function updateWebhookModal() {
    const status = document.getElementById('webhookStatus');
    const toggleBtn = document.getElementById('webhookToggleBtn');
    
    if (webhookEnabled) {
        status.textContent = 'Status: Enabled';
        toggleBtn.textContent = 'Disable';
        toggleBtn.classList.add('disabled');
    } else {
        status.textContent = 'Status: Disabled';
        toggleBtn.textContent = 'Enable';
        toggleBtn.classList.remove('disabled');
    }
}

// NEW: Simulate webhook updates (since Setmore webhooks may not be available)
function startWebhookSimulation() {
    if (webhookInterval) clearInterval(webhookInterval);
    
    webhookInterval = setInterval(() => {
        const activities = [
            'New appointment booked',
            'Appointment confirmed',
            'Appointment completed',
            'Customer review received',
            'Service updated',
            'Staff schedule changed'
        ];
        
        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        addActivityMessage(randomActivity, 'info');
        
        // Occasionally refresh data
        if (Math.random() < 0.1) { // 10% chance
            if (demoMode) {
                loadDemoData();
            } else {
                loadDashboard();
            }
        }
    }, 30000); // Every 30 seconds
}

function stopWebhookSimulation() {
    if (webhookInterval) {
        clearInterval(webhookInterval);
        webhookInterval = null;
    }
}

// UI Helper Functions
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('dashboard').classList.remove('hidden');
}

function hideDashboard() {
    document.getElementById('dashboard').classList.add('hidden');
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('error').classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// Auto-refresh data every 30 minutes
setInterval(async () => {
    const lastUpdate = localStorage.getItem('data_timestamp');
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (lastUpdate && (Date.now() - parseInt(lastUpdate)) > thirtyMinutes) {
        if (!demoMode && accessToken) {
            try {
                // Get a valid access token (refresh if needed)
                const validToken = await getValidAccessToken();
                if (validToken) {
                    console.log('Auto-refreshing dashboard data...');
                    await loadDashboardWithToken(validToken);
                }
            } catch (error) {
                console.log('Auto-refresh failed:', error.message);
                // Don't show error for auto-refresh failures
            }
        }
    }
}, 60000); // Check every minute

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('webhookModal');
    if (event.target === modal) {
        closeWebhookModal();
    }
});

// NEW: Calendar Insights Chart Functions

// Create Booking Lead Time Analysis Chart
function createLeadTimeChart() {
    const leadTimes = dashboardData.stats.leadTimes || [];
    
    // If no lead time data available, show empty chart with message
    if (leadTimes.length === 0) {
        const ctx = document.getElementById('leadTimeChart').getContext('2d');
        charts.leadTime = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['No Data Available'],
                datasets: [{
                    label: 'Bookings',
                    data: [0],
                    backgroundColor: ['#718096'],
                    borderColor: ['#4a5568'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function() {
                                return 'Lead time data not available from Setmore API';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
        return;
    }
    
    const leadTimeRanges = {
        'Same Day': leadTimes.filter(lt => lt === 0).length,
        '1-3 Days': leadTimes.filter(lt => lt >= 1 && lt <= 3).length,
        '4-7 Days': leadTimes.filter(lt => lt >= 4 && lt <= 7).length,
        '1-2 Weeks': leadTimes.filter(lt => lt >= 8 && lt <= 14).length,
        '2+ Weeks': leadTimes.filter(lt => lt >= 15).length
    };

    const ctx = document.getElementById('leadTimeChart').getContext('2d');
    charts.leadTime = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(leadTimeRanges),
            datasets: [{
                label: 'Bookings',
                data: Object.values(leadTimeRanges),
                backgroundColor: [
                    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'
                ],
                borderColor: [
                    '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Preferred Booking Days Chart
function createPreferredDaysChart() {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDay = dashboardData.stats.byDay || {};
    const dayData = dayNames.map((day, index) => byDay[index] || 0);

    const ctx = document.getElementById('preferredDaysChart').getContext('2d');
    charts.preferredDays = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dayNames,
            datasets: [{
                label: 'Appointments',
                data: dayData,
                borderColor: 'rgba(102, 126, 234, 1)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Seasonal Booking Trends Chart
function createSeasonalChart() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const seasonalData = dashboardData.stats.seasonalData || {};
    const seasonalDataArray = monthNames.map((month, index) => seasonalData[index] || 0);
    
    // If no seasonal data available, show empty chart with message
    if (seasonalDataArray.every(value => value === 0)) {
        const ctx = document.getElementById('seasonalChart').getContext('2d');
        charts.seasonal = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['No Data'],
                datasets: [{
                    label: 'Bookings',
                    data: [0],
                    borderColor: 'rgba(118, 75, 162, 1)',
                    backgroundColor: 'rgba(118, 75, 162, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(118, 75, 162, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function() {
                                return 'Seasonal data not available from Setmore API';
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
        return;
    }

    const ctx = document.getElementById('seasonalChart').getContext('2d');
    charts.seasonal = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: monthNames,
                         datasets: [{
                 label: 'Bookings',
                 data: seasonalDataArray,
                borderColor: 'rgba(118, 75, 162, 1)',
                backgroundColor: 'rgba(118, 75, 162, 0.2)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(118, 75, 162, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Last-Minute vs Advanced Bookings Chart
function createBookingTimingChart() {
    const lastMinuteBookings = dashboardData.stats.lastMinuteBookings || 0;
    const advancedBookings = dashboardData.stats.advancedBookings || 0;
    const total = dashboardData.stats.total || 0;
    
    // If no booking timing data available, show empty chart with message
    if (total === 0 || (lastMinuteBookings === 0 && advancedBookings === 0)) {
        const ctx = document.getElementById('bookingTimingChart').getContext('2d');
        charts.bookingTiming = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data Available'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#718096'],
                    borderColor: ['#4a5568'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function() {
                                return 'Booking timing data not available from Setmore API';
                            }
                        }
                    }
                }
            }
        });
        return;
    }
    
    const timingData = {
        'Last-Minute (≤1 day)': lastMinuteBookings,
        'Short Notice (2-6 days)': total - lastMinuteBookings - advancedBookings,
        'Advanced (≥7 days)': advancedBookings
    };

    const ctx = document.getElementById('bookingTimingChart').getContext('2d');
    charts.bookingTiming = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(timingData),
            datasets: [{
                data: Object.values(timingData),
                backgroundColor: [
                    '#ef4444', '#f59e0b', '#10b981'
                ],
                borderColor: [
                    '#dc2626', '#d97706', '#059669'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20 }
                }
            }
        }
    });
}

// Create Monthly Booking Patterns Chart
function createMonthlyPatternsChart() {
    const byMonth = dashboardData.stats.byMonth || {};
    const monthStats = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12); // Last 12 months

    const ctx = document.getElementById('monthlyPatternsChart').getContext('2d');
    charts.monthlyPatterns = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthStats.map(([month]) => {
                const date = new Date(month + '-01');
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }),
            datasets: [{
                label: 'Appointments',
                data: monthStats.map(([, count]) => count),
                backgroundColor: 'rgba(240, 147, 251, 0.8)',
                borderColor: 'rgba(240, 147, 251, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// Create Scheduling Insights
function createSchedulingInsights() {
    const container = document.getElementById('schedulingInsights');
    
    // Calculate insights with safety checks
    const leadTimes = dashboardData.stats.leadTimes || [];
    const avgLeadTime = leadTimes.length > 0 
        ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
        : 0;
    
    const lastMinuteBookings = dashboardData.stats.lastMinuteBookings || 0;
    const total = dashboardData.stats.total || 0;
    const lastMinuteRate = total > 0 
        ? Math.round((lastMinuteBookings / total) * 100) 
        : 0;
    
    const byDay = dashboardData.stats.byDay || {};
    const peakDay = Object.entries(byDay)
        .sort(([,a], [,b]) => b - a)[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDayName = peakDay ? dayNames[parseInt(peakDay[0])] : 'Unknown';
    
    // Define month names for seasonal analysis
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let html = '';
    
    // Check if we have meaningful data for insights
    const hasAppointments = total > 0;
    const hasLeadTimeData = leadTimes.length > 0;
    const hasDayData = Object.keys(byDay).length > 0;
    const hasSeasonalData = Object.keys(dashboardData.stats.seasonalData || {}).length > 0;
    
    if (!hasAppointments) {
        html = `
            <div class="scheduling-insight">
                <h4>📊 No Appointment Data</h4>
                <div class="insight-details">
                    No appointments found in the selected date range.<br>
                    Try adjusting the date range or check your Setmore account for recent bookings.
                </div>
                <div class="insight-priority medium">INFO</div>
            </div>
        `;
    } else {
        // Lead time insight (only if we have lead time data)
        if (hasLeadTimeData) {
            let leadTimeInsight = '';
            let leadTimePriority = '';
            if (avgLeadTime <= 2) {
                leadTimeInsight = 'Customers prefer last-minute bookings. Consider promoting advance booking discounts.';
                leadTimePriority = 'high';
            } else if (avgLeadTime <= 7) {
                leadTimeInsight = 'Good balance of advance and last-minute bookings.';
                leadTimePriority = 'optimal';
            } else {
                leadTimeInsight = 'Customers book well in advance. Great for planning!';
                leadTimePriority = 'low';
            }
            
            html += `
                <div class="scheduling-insight">
                    <h4>📅 Booking Lead Time</h4>
                    <div class="insight-details">
                        Average lead time: ${avgLeadTime} days<br>
                        ${leadTimeInsight}
                    </div>
                    <div class="insight-priority ${leadTimePriority}">${leadTimePriority.toUpperCase()}</div>
                </div>
            `;
        } else {
            html += `
                <div class="scheduling-insight">
                    <h4>📅 Booking Lead Time</h4>
                    <div class="insight-details">
                        Lead time data not available from Setmore API.<br>
                        This feature requires booking timestamp information.
                    </div>
                    <div class="insight-priority medium">INFO</div>
                </div>
            `;
        }
        
        // Last-minute booking insight (only if we have lead time data)
        if (hasLeadTimeData) {
            let lastMinuteInsight = '';
            let lastMinutePriority = '';
            if (lastMinuteRate > 30) {
                lastMinuteInsight = 'High last-minute booking rate. Consider implementing advance booking incentives.';
                lastMinutePriority = 'high';
            } else if (lastMinuteRate > 15) {
                lastMinuteInsight = 'Moderate last-minute bookings. Monitor for trends.';
                lastMinutePriority = 'medium';
            } else {
                lastMinuteInsight = 'Low last-minute booking rate. Good advance planning.';
                lastMinutePriority = 'low';
            }
            
            html += `
                <div class="scheduling-insight">
                    <h4>⏰ Last-Minute Bookings</h4>
                    <div class="insight-details">
                        Last-minute rate: ${lastMinuteRate}%<br>
                        ${lastMinuteInsight}
                    </div>
                    <div class="insight-priority ${lastMinutePriority}">${lastMinutePriority.toUpperCase()}</div>
                </div>
            `;
        }
        
        // Peak day insight (only if we have day data)
        if (hasDayData) {
            html += `
                <div class="scheduling-insight">
                    <h4>📊 Peak Booking Day</h4>
                    <div class="insight-details">
                        Busiest day: ${peakDayName}<br>
                        Consider offering special promotions on slower days to balance demand.
                    </div>
                    <div class="insight-priority medium">MEDIUM</div>
                </div>
            `;
        }
        
        // Seasonal insight (only if we have seasonal data)
        if (hasSeasonalData) {
            const seasonalData = dashboardData.stats.seasonalData || {};
            const seasonalPeak = Object.entries(seasonalData)
                .sort(([,a], [,b]) => b - a)[0];
            const seasonalPeakMonth = seasonalPeak ? monthNames[parseInt(seasonalPeak[0])] : 'Unknown';
            
            html += `
                <div class="scheduling-insight">
                    <h4>🌤️ Seasonal Trends</h4>
                    <div class="insight-details">
                        Peak booking month: ${seasonalPeakMonth}<br>
                        Plan marketing campaigns around seasonal peaks and prepare for slower periods.
                    </div>
                    <div class="insight-priority medium">MEDIUM</div>
                </div>
            `;
        }
    }
    
    container.innerHTML = html;
}

// PWA Functionality - Move to end of file
function initializePWA() {
    console.log('🚀 Initializing PWA...');
    
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }

    // PWA Install Prompt
    let deferredPrompt;
    const installButton = document.createElement('button');
    installButton.textContent = '📱 Install App';
    installButton.className = 'install-btn';
    installButton.style.display = 'none';

    // Mobile PWA detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isChrome = /Chrome/.test(navigator.userAgent);

    // Debug logging
    console.log('🔍 PWA Detection Debug:', {
        isMobile,
        isIOS,
        isAndroid,
        isSafari,
        isChrome,
        userAgent: navigator.userAgent,
        standalone: window.matchMedia('(display-mode: standalone)').matches
    });

    // Add install button to the page
    function addPWAButtons() {
        console.log('🚀 Adding PWA buttons...');
        const header = document.querySelector('header');
        console.log('📋 Header found:', !!header);
        
        if (header) {
            // Add main install button
            header.appendChild(installButton);
            console.log('✅ Install button added to header');
            
            // Add iOS-specific manual install button
            if (isIOS && !window.matchMedia('(display-mode: standalone)').matches) {
                console.log('🍎 Creating iOS install button');
                const iosInstallBtn = document.createElement('button');
                
                if (isSafari) {
                    iosInstallBtn.textContent = '📱 Safari Install';
                    iosInstallBtn.className = 'safari-install-btn';
                    iosInstallBtn.onclick = () => {
                        console.log('🍎 Safari install button clicked');
                        const safariPrompt = document.createElement('div');
                        safariPrompt.className = 'mobile-pwa-prompt';
                        safariPrompt.style.display = 'flex';
                        safariPrompt.innerHTML = `
                            <div class="mobile-prompt-content">
                                <h3>📱 Install in Safari</h3>
                                <p>1. Tap the <strong>share button</strong> <span class="icon">⎋</span> at the bottom</p>
                                <p>2. Scroll down and tap <strong>"Add to Home Screen"</strong></p>
                                <p>3. Tap <strong>"Add"</strong> to install the app</p>
                                <p class="safari-note">💡 Safari will add the app to your home screen like a native app!</p>
                                <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
                            </div>
                        `;
                        document.body.appendChild(safariPrompt);
                        console.log('✅ Safari prompt added to body');
                    };
                } else if (isChrome) {
                    iosInstallBtn.textContent = '📱 Chrome Install';
                    iosInstallBtn.className = 'ios-install-btn';
                    iosInstallBtn.onclick = () => {
                        console.log('🍎 Chrome install button clicked');
                        const chromePrompt = document.createElement('div');
                        chromePrompt.className = 'mobile-pwa-prompt';
                        chromePrompt.style.display = 'flex';
                        chromePrompt.innerHTML = `
                            <div class="mobile-prompt-content">
                                <h3>📱 Install in Chrome</h3>
                                <p>1. Tap the <strong>menu button</strong> <span class="icon">⋮</span> at the top</p>
                                <p>2. Tap <strong>"Add to Home Screen"</strong></p>
                                <p>3. Tap <strong>"Add"</strong> to install the app</p>
                                <p class="chrome-note">💡 Chrome will add the app to your home screen!</p>
                                <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
                            </div>
                        `;
                        document.body.appendChild(chromePrompt);
                        console.log('✅ Chrome prompt added to body');
                    };
                } else {
                    // Fallback for other browsers
                    iosInstallBtn.textContent = '📱 iOS Install';
                    iosInstallBtn.className = 'ios-install-btn';
                    iosInstallBtn.onclick = () => {
                        console.log('🍎 Generic iOS install button clicked');
                        const genericPrompt = document.createElement('div');
                        genericPrompt.className = 'mobile-pwa-prompt';
                        genericPrompt.style.display = 'flex';
                        genericPrompt.innerHTML = `
                            <div class="mobile-prompt-content">
                                <h3>📱 Install on iOS</h3>
                                <p>1. Tap the share button <span class="icon">⎋</span> at the bottom</p>
                                <p>2. Scroll down and tap "Add to Home Screen"</p>
                                <p>3. Tap "Add" to install the app</p>
                                <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
                            </div>
                        `;
                        document.body.appendChild(genericPrompt);
                        console.log('✅ Generic iOS prompt added to body');
                    };
                }
                
                iosInstallBtn.style.display = 'inline-block'; // Force display
                header.appendChild(iosInstallBtn);
                console.log('✅ iOS install button added to header');
            } else {
                console.log('❌ Not creating iOS button:', {
                    isIOS,
                    isStandalone: window.matchMedia('(display-mode: standalone)').matches
                });
            }
            
            // Show mobile-specific instructions
            if (isMobile && !window.matchMedia('(display-mode: standalone)').matches) {
                console.log('📱 Showing mobile PWA prompt');
                const mobilePrompt = document.createElement('div');
                mobilePrompt.className = 'mobile-pwa-prompt';
                mobilePrompt.innerHTML = `
                    <div class="mobile-prompt-content">
                        <h3>📱 Install as App</h3>
                        <p>${isIOS ? 
                            'Tap the share button <span class="icon">⎋</span> then "Add to Home Screen"' : 
                            'Tap the menu <span class="icon">⋮</span> then "Add to Home Screen"'
                        }</p>
                        <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
                    </div>
                `;
                document.body.appendChild(mobilePrompt);
                console.log('✅ Mobile prompt added to body');
                
                // Force show on iOS after a delay
                if (isIOS) {
                    setTimeout(() => {
                        console.log('🍎 Forcing iOS prompt visibility');
                        mobilePrompt.style.display = 'flex';
                    }, 1000);
                }
            } else {
                console.log('❌ Not showing mobile prompt:', {
                    isMobile,
                    isStandalone: window.matchMedia('(display-mode: standalone)').matches
                });
            }
        } else {
            console.log('❌ No header found');
        }
    }

    // Install prompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('📱 Before install prompt triggered');
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        deferredPrompt = e;
        // Show the install button (mainly for desktop)
        installButton.style.display = 'inline-block';
        
        installButton.addEventListener('click', () => {
            console.log('📱 Install button clicked');
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                } else {
                    console.log('User dismissed the install prompt');
                }
                deferredPrompt = null;
                installButton.style.display = 'none';
            });
        });
    });

    // Initialize PWA buttons
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addPWAButtons);
    } else {
        addPWAButtons();
    }
    
    // Fallback: Add a test button to verify PWA code is running
    setTimeout(() => {
        console.log('🔧 Adding fallback test button...');
        const header = document.querySelector('header');
        if (header) {
            const testBtn = document.createElement('button');
            testBtn.textContent = '🧪 Test PWA';
            testBtn.style.cssText = 'background: red; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px;';
            testBtn.onclick = () => {
                alert('PWA code is running! iOS: ' + isIOS + ', Safari: ' + isSafari + ', Chrome: ' + isChrome);
            };
            header.appendChild(testBtn);
            console.log('✅ Test button added');
        }
    }, 2000);
}

// Initialize PWA when script loads
initializePWA();

// Simple PWA Test - Add this at the very end
console.log('🔧 PWA Test: Script loaded');

// Simple PWA initialization
function simplePWAInit() {
    console.log('🚀 Simple PWA Init starting...');
    
    // Wait for page to load
    setTimeout(() => {
        const header = document.querySelector('header');
        console.log('📋 Header found:', !!header);
        
        if (header) {
            // Add a simple test button
            const testBtn = document.createElement('button');
            testBtn.textContent = '🧪 PWA Test';
            testBtn.style.cssText = 'background: red; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
            testBtn.onclick = () => {
                alert('PWA code is working!');
            };
            header.appendChild(testBtn);
            console.log('✅ Test button added');
            
            // Check if iOS
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
            const isChrome = /Chrome/.test(navigator.userAgent);
            
            console.log('📱 Device detection:', { isIOS, isSafari, isChrome });
            
            if (isIOS) {
                // Add iOS install button
                const iosBtn = document.createElement('button');
                if (isSafari) {
                    iosBtn.textContent = '📱 Safari Install';
                    iosBtn.style.cssText = 'background: #007aff; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
                } else {
                    iosBtn.textContent = '📱 Chrome Install';
                    iosBtn.style.cssText = 'background: #ff6b35; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
                }
                
                iosBtn.onclick = () => {
                    const prompt = document.createElement('div');
                    prompt.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
                    prompt.innerHTML = `
                        <div style="background: white; padding: 24px; border-radius: 12px; max-width: 300px; text-align: center;">
                            <h3>📱 Install App</h3>
                            <p>${isSafari ? 
                                '1. Tap the share button ⎋ at the bottom<br>2. Tap "Add to Home Screen"' : 
                                '1. Tap the menu ⋮ at the top<br>2. Tap "Add to Home Screen"'
                            }</p>
                            <button onclick="this.parentElement.parentElement.remove()" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; margin-top: 16px;">Got it!</button>
                        </div>
                    `;
                    document.body.appendChild(prompt);
                };
                
                header.appendChild(iosBtn);
                console.log('✅ iOS install button added');
            }
        } else {
            console.log('❌ No header found');
        }
    }, 1000);
}

// Start simple PWA
simplePWAInit();
