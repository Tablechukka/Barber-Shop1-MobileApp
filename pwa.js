// PWA Functionality - Separate file
console.log('🚀 PWA.js loaded');

// Wait for page to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('📱 PWA: DOM loaded');
    
    // Find header
    const header = document.querySelector('header');
    console.log('📋 PWA: Header found:', !!header);
    
    if (header) {
        // Add test button
        const testBtn = document.createElement('button');
        testBtn.textContent = '🧪 PWA Test';
        testBtn.style.cssText = 'background: red; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
        testBtn.onclick = function() {
            alert('PWA.js is working!');
        };
        header.appendChild(testBtn);
        console.log('✅ PWA: Test button added');
        
        // iOS detection
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);
        const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);
        const isChrome = /Chrome|CriOS/.test(userAgent);
        const isStandalone = window.navigator.standalone === true;
        
        console.log('📱 PWA: Device detection:', {
            isIOS: isIOS,
            isSafari: isSafari,
            isChrome: isChrome,
            isStandalone: isStandalone,
            userAgent: userAgent.substring(0, 50) + '...'
        });
        
        // Add iOS install button
        if (isIOS && !isStandalone) {
            console.log('🍎 PWA: iOS detected, adding install button');
            
            const iosBtn = document.createElement('button');
            
            if (isSafari) {
                iosBtn.textContent = '📱 Safari Install';
                iosBtn.style.cssText = 'background: #007aff; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
                console.log('🔵 PWA: Safari button created');
            } else if (isChrome) {
                iosBtn.textContent = '📱 Chrome Install';
                iosBtn.style.cssText = 'background: #ff6b35; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
                console.log('🟠 PWA: Chrome button created');
            } else {
                iosBtn.textContent = '📱 iOS Install';
                iosBtn.style.cssText = 'background: #3b82f6; color: white; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 8px; font-size: 14px;';
                console.log('🔷 PWA: Generic iOS button created');
            }
            
            iosBtn.onclick = function() {
                console.log('📱 PWA: Install button clicked');
                
                const prompt = document.createElement('div');
                prompt.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;';
                
                let instructions = '';
                if (isSafari) {
                    instructions = `
                        <h4>📱 Install in Safari:</h4>
                        <ol style="text-align: left; margin: 20px 0;">
                            <li>Tap the <strong>share button</strong> ⎋ at the bottom</li>
                            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                            <li>Tap <strong>"Add"</strong> to install</li>
                        </ol>
                    `;
                } else if (isChrome) {
                    instructions = `
                        <h4>📱 Install in Chrome:</h4>
                        <ol style="text-align: left; margin: 20px 0;">
                            <li>Tap the <strong>menu button</strong> ⋮ at the top</li>
                            <li>Tap <strong>"Add to Home Screen"</strong></li>
                            <li>Tap <strong>"Add"</strong> to install</li>
                        </ol>
                    `;
                } else {
                    instructions = `
                        <h4>📱 Install App:</h4>
                        <ol style="text-align: left; margin: 20px 0;">
                            <li>Open this page in Safari</li>
                            <li>Tap the share button ⎋</li>
                            <li>Select "Add to Home Screen"</li>
                            <li>Tap "Add" to install</li>
                        </ol>
                    `;
                }
                
                prompt.innerHTML = `
                    <div style="background: white; padding: 24px; border-radius: 12px; max-width: 350px; text-align: center;">
                        <h3>📱 Install Barber Dashboard</h3>
                        ${instructions}
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">
                            💡 <strong>Tip:</strong> This will create a home screen icon that opens the app directly!
                        </p>
                        <button onclick="this.parentElement.parentElement.remove()" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; margin-top: 16px; cursor: pointer;">Got it!</button>
                    </div>
                `;
                
                document.body.appendChild(prompt);
            };
            
            header.appendChild(iosBtn);
            console.log('✅ PWA: iOS install button added');
        } else if (isStandalone) {
            console.log('✅ PWA: App is already installed (standalone mode)');
        } else {
            console.log('❌ PWA: Not iOS device');
        }
    } else {
        console.log('❌ PWA: No header found');
    }
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('✅ PWA: Service Worker registered:', registration);
            })
            .catch(function(registrationError) {
                console.log('❌ PWA: Service Worker registration failed:', registrationError);
            });
    });
}
