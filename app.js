class GameBoyCamera {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.previewCanvas = document.getElementById('preview-canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.previewCtx = this.previewCanvas.getContext('2d', { willReadFrequently: true });
        this.photos = [];
        this.currentFilter = 'normal';
        this.animationId = null;
        this.facingMode = 'user'; // Track current camera
        
        // Create a stable dithering matrix for consistent preview
        this.ditherMatrix = this.generateStableDitherMatrix(160, 144);
        
        this.loadPhotos();
        this.init();
    }

    generateStableDitherMatrix(width, height) {
        const matrix = [];
        for (let y = 0; y < height; y++) {
            matrix[y] = [];
            for (let x = 0; x < width; x++) {
                // Use a deterministic pattern based on position
                matrix[y][x] = ((x * 7 + y * 11) % 16) / 16.0;
            }
        }
        return matrix;
    }

    loadPhotos() {
        // Using in-memory storage instead of localStorage for this artifact
        this.photos = this.photos || [];
    }

    savePhotos() {
        // In-memory storage - photos will persist during the session
        // This prevents localStorage issues in the artifact environment
    }

    async initializeCameraStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    facingMode: this.facingMode
                } 
            });
            this.video.srcObject = stream;
            this.currentStream = stream; // Save for switching
            return true;
        } catch (error) {
            console.error('Camera access error:', error);
            document.querySelector('.viewfinder').innerHTML = 
                '<div style="color: #808080; text-align: center; padding: 20px;">CAMERA NOT AVAILABLE</div>';
            return false;
        }
    }

    async init() {
        const cameraReady = await this.initializeCameraStream();
        if (cameraReady) {
            this.video.addEventListener('loadedmetadata', () => {
                this.setupCanvas();
                this.startPreview();
            }, { once: true });
        }
        this.setupEventListeners();
        this.updatePhotoCount();
    }

    setupCanvas() {
        // Set both canvases with Game Boy resolution (160x144)
        this.previewCanvas.width = 160;
        this.previewCanvas.height = 144;
        this.canvas.width = 160;
        this.canvas.height = 144;
        
        // Disable anti-aliasing for pixelated effect
        this.previewCtx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingEnabled = false;
    }

    startPreview() {
        const updatePreview = () => {
            if (this.video.readyState >= 2) {
                // Draw video to preview canvas with Game Boy resolution
                this.previewCtx.drawImage(this.video, 0, 0, 160, 144);
                
                // Apply stable grayscale effect for preview
                this.applyGrayscaleEffectStable(this.previewCtx, 160, 144);
            }
            this.animationId = requestAnimationFrame(updatePreview);
        };
        updatePreview();
    }

    setupEventListeners() {
        document.getElementById('capture-btn').addEventListener('click', () => this.capturePhoto());
        document.getElementById('gallery-btn').addEventListener('click', () => this.showGallery());
        document.getElementById('close-gallery').addEventListener('click', () => this.hideGallery());
        document.getElementById('clear-gallery').addEventListener('click', () => this.showConfirmDialog());
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideConfirmDialog());
        document.getElementById('confirm-delete').addEventListener('click', () => this.clearGallery());
        document.getElementById('switch-camera-btn').addEventListener('click', () => this.switchCamera());

        // Filter controls
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.filter-btn.active').classList.remove('active');
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                this.capturePhoto();
            }
        });
    }

    capturePhoto() {
        // Flash effect
        document.querySelector('.screen').style.background = '#1A1A1A';
        setTimeout(() => {
            document.querySelector('.screen').style.background = '#E0E0E0';
        }, 100);

        // Draw current frame to capture canvas
        this.ctx.drawImage(this.video, 0, 0, 160, 144);
        
        // Apply high-quality grayscale effect with Floyd-Steinberg dithering
        this.applyGrayscaleEffectHighQuality(this.ctx, 160, 144);
        
        // Convert to data URL and save
        const dataURL = this.canvas.toDataURL('image/png');
        const timestamp = new Date().toISOString();
        
        this.photos.unshift({
            id: Date.now(),
            data: dataURL,
            timestamp: timestamp,
            filter: this.currentFilter
        });
        
        // Keep only the last 30 photos
        if (this.photos.length > 30) {
            this.photos = this.photos.slice(0, 30);
        }
        
        this.savePhotos();
        this.updatePhotoCount();
    }

    applyGrayscaleEffectStable(context, width, height) {
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Grayscale palette (4 levels)
        const palette = [
            [26, 26, 26],      // Darkest #1A1A1A
            [128, 128, 128],   // Dark gray #808080
            [192, 192, 192],   // Light gray #C0C0C0
            [224, 224, 224]    // Lightest #E0E0E0
        ];

        // Apply filter effects first
        this.applyFilterEffect(data, width, height);
        
        // Use stable ordered dithering for preview
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Convert to grayscale
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                
                // Apply stable dithering using pre-computed matrix
                const threshold = this.ditherMatrix[y][x] * 64 - 32;
                const ditheredGray = Math.max(0, Math.min(255, gray + threshold));
                
                // Quantize to 4 levels
                const paletteIndex = this.findClosestPaletteIndex(ditheredGray);
                
                // Set new pixel color
                const color = palette[paletteIndex];
                data[i] = color[0];
                data[i + 1] = color[1];
                data[i + 2] = color[2];
            }
        }
        
        context.putImageData(imageData, 0, 0);
    }

    applyGrayscaleEffectHighQuality(context, width, height) {
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Same grayscale palette as preview
        const palette = [
            [26, 26, 26],      // Darkest #1A1A1A
            [128, 128, 128],   // Dark gray #808080
            [192, 192, 192],   // Light gray #C0C0C0
            [224, 224, 224]    // Lightest #E0E0E0
        ];

        // Apply filter effects first
        this.applyFilterEffect(data, width, height);
        
        // Use the same stable dithering algorithm as preview for consistency
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Convert to grayscale
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                
                // Apply the same stable dithering as preview
                const threshold = this.ditherMatrix[y][x] * 64 - 32;
                const ditheredGray = Math.max(0, Math.min(255, gray + threshold));
                
                // Quantize to 4 levels
                const paletteIndex = this.findClosestPaletteIndex(ditheredGray);
                
                // Set new pixel color
                const color = palette[paletteIndex];
                data[i] = color[0];
                data[i + 1] = color[1];
                data[i + 2] = color[2];
            }
        }
        
        context.putImageData(imageData, 0, 0);
    }

    applyFilterEffect(data, width, height) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            switch (this.currentFilter) {
                case 'contrast':
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    const enhanced = gray > 128 ? Math.min(255, gray * 1.5) : Math.max(0, gray * 0.5);
                    data[i] = data[i + 1] = data[i + 2] = enhanced;
                    break;
                case 'flash':
                    // Aumenta luminosità e contrasto per "flash"
                    let flashGray = 0.299 * r + 0.587 * g + 0.114 * b;
                    flashGray = Math.min(255, flashGray * 1.7 + 40); // boost luminosità
                    // Contrasto più alto
                    flashGray = flashGray > 128 ? Math.min(255, flashGray * 1.2) : Math.max(0, flashGray * 0.8);
                    data[i] = data[i + 1] = data[i + 2] = flashGray;
                    break;
                case 'invert':
                    data[i] = 255 - r;
                    data[i + 1] = 255 - g;
                    data[i + 2] = 255 - b;
                    break;
                default: // normal
                    const normalGray = 0.299 * r + 0.587 * g + 0.114 * b;
                    data[i] = data[i + 1] = data[i + 2] = normalGray;
                    break;
            }
        }
    }

    findClosestPaletteIndex(gray) {
        // Map grayscale to 4-level palette
        if (gray < 64) return 0;       // Darkest
        else if (gray < 128) return 1; // Dark
        else if (gray < 192) return 2; // Light
        else return 3;                 // Lightest
    }

    addError(data, width, x, y, error) {
        // This function is no longer needed since we're using the same dithering algorithm
        // for both preview and capture
    }

    showGallery() {
        const gallery = document.getElementById('gallery');
        const grid = document.getElementById('gallery-grid');
        
        grid.innerHTML = '';
        
        this.photos.forEach(photo => {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'gallery-photo';
            photoDiv.innerHTML = `<img src="${photo.data}" alt="Game Boy Photo">`;
            photoDiv.addEventListener('click', () => this.downloadPhoto(photo));
            grid.appendChild(photoDiv);
        });
        
        if (this.photos.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #E0E0E0; padding: 40px;">NO PHOTOS SAVED</div>';
        }
        
        gallery.style.display = 'block';
    }

    hideGallery() {
        document.getElementById('gallery').style.display = 'none';
    }

    showConfirmDialog() {
        document.getElementById('confirm-dialog').style.display = 'block';
    }

    hideConfirmDialog() {
        document.getElementById('confirm-dialog').style.display = 'none';
    }

    clearGallery() {
        this.photos = [];
        this.savePhotos();
        this.updatePhotoCount();
        this.hideConfirmDialog();
        this.showGallery(); // Reload empty gallery
    }

    downloadPhoto(photo) {
        const a = document.createElement('a');
        a.href = photo.data;
        a.download = `gameboy-photo-${photo.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    updatePhotoCount() {
        document.getElementById('photo-count').textContent = 
            this.photos.length.toString().padStart(3, '0');
    }

    async switchCamera() {
        // Toggle facingMode
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        // Stop current stream
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }
        // Only re-initialize the camera stream
        await this.initializeCameraStream();
    }
}

// Initialize when page is loaded
window.addEventListener('load', () => {
    new GameBoyCamera();
});
