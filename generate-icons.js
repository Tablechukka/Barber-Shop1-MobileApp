const fs = require('fs');
const { createCanvas } = require('canvas');

// Create a simple canvas-based icon generator
function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, 0, size, size);
    
    // Icon (scissors)
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size * 0.08;
    
    // Draw scissors
    const centerX = size / 2;
    const centerY = size / 2;
    const iconSize = size * 0.4;
    
    // Left blade
    ctx.beginPath();
    ctx.moveTo(centerX - iconSize * 0.3, centerY - iconSize * 0.2);
    ctx.lineTo(centerX - iconSize * 0.1, centerY + iconSize * 0.2);
    ctx.stroke();
    
    // Right blade
    ctx.beginPath();
    ctx.moveTo(centerX + iconSize * 0.3, centerY - iconSize * 0.2);
    ctx.lineTo(centerX + iconSize * 0.1, centerY + iconSize * 0.2);
    ctx.stroke();
    
    // Handle
    ctx.beginPath();
    ctx.arc(centerX, centerY, iconSize * 0.15, 0, 2 * Math.PI);
    ctx.fill();
    
    return canvas.toBuffer('image/png');
}

// Generate all required icon sizes
const sizes = [192, 512, 152, 180, 167];

sizes.forEach(size => {
    const iconBuffer = createIcon(size);
    fs.writeFileSync(`icon-${size}.png`, iconBuffer);
    console.log(`Generated icon-${size}.png`);
});

console.log('All icons generated successfully!');
