/**
 * Service de scan et reconnaissance d'ISBN
 * Gère la caméra et l'analyse d'images avec Tesseract.js
 */
class ISBNScanner {
    constructor() {
        this.cameraStream = null;
        this.isScanning = false;
        this.tesseractWorker = null;
    }

    /**
     * Démarrer le scan par caméra
     */
    async startCameraScan() {
        const modal = document.getElementById('cameraModal');
        const video = document.getElementById('cameraVideo');
        const scanBtn = document.getElementById('scanBtn');
        const status = document.getElementById('scanStatus');

        try {
            scanBtn.disabled = true;
            scanBtn.textContent = '📷 Démarrage...';
            status.textContent = 'Démarrage de la caméra...';

            // Demander l'accès à la caméra
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Caméra arrière sur mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            video.srcObject = this.cameraStream;
            modal.style.display = 'flex';
            status.textContent = 'Positionnez l\'ISBN devant la caméra et cliquez sur Capturer';
            this.isScanning = true;

        } catch (error) {
            console.error('Erreur caméra:', error);
            alert('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
            status.textContent = 'Erreur d\'accès à la caméra';
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = '📷 Scanner';
        }
    }

    /**
     * Arrêter le scan
     */
    stopCameraScan() {
        const modal = document.getElementById('cameraModal');
        const video = document.getElementById('cameraVideo');

        this.isScanning = false;

        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }

        video.srcObject = null;
        modal.style.display = 'none';
    }

    /**
     * Capturer une image et analyser l'ISBN
     */
    async captureAndAnalyze() {
        const video = document.getElementById('cameraVideo');
        const status = document.getElementById('scanStatus');
        const captureBtn = document.querySelector('.capture-btn');

        if (!this.isScanning) return;

        try {
            captureBtn.disabled = true;
            captureBtn.textContent = 'Analyse...';
            status.innerHTML = '<div class="scan-loader"></div>Reconnaissance du texte en cours...';

            // Créer un canvas pour capturer l'image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            // Analyser l'image avec Tesseract
            const isbn = await this.recognizeISBNFromCanvas(canvas, (progress) => {
                const percentage = Math.round(progress * 100);
                status.innerHTML = `<div class="scan-loader"></div>Reconnaissance: ${percentage}%`;
            });

            if (isbn) {
                status.textContent = `ISBN trouvé: ${isbn}`;
                document.getElementById('isbnInput').value = isbn;
                
                setTimeout(() => {
                    this.stopCameraScan();
                    // Déclencher automatiquement la recherche
                    if (window.searchBook) {
                        searchBook();
                    }
                }, 1500);
            } else {
                status.textContent = 'Aucun ISBN détecté. Repositionnez et réessayez.';
            }

        } catch (error) {
            console.error('Erreur reconnaissance:', error);
            status.textContent = 'Erreur lors de la reconnaissance. Réessayez.';
        } finally {
            captureBtn.disabled = false;
            captureBtn.textContent = 'Capturer';
        }
    }

    /**
     * Analyser une image uploadée
     */
    async analyzeUploadedImage(file) {
        const uploadBtn = document.getElementById('uploadBtn');
        const originalText = uploadBtn.textContent;

        try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '📁 Analyse...';

            console.log('🔍 Début de l\'analyse de l\'image:', file.name, file.size, 'bytes');

            // Vérifier que Tesseract est disponible
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js n\'est pas chargé. Vérifiez que le script est inclus.');
            }

            // Convertir le fichier en image
            const img = await this.fileToImage(file);
            console.log('🖼️ Image convertie:', img.width, 'x', img.height);
            
            // Analyser l'image
            const isbn = await this.recognizeISBNFromImage(img, (progress) => {
                const percentage = Math.round(progress * 100);
                uploadBtn.textContent = `📁 ${percentage}%`;
                console.log('📊 Progression OCR:', percentage + '%');
            });

            if (isbn) {
                console.log('✅ ISBN trouvé:', isbn);
                document.getElementById('isbnInput').value = isbn;
                uploadBtn.textContent = '✅ Trouvé!';
                
                setTimeout(() => {
                    if (window.searchBook) {
                        searchBook();
                    }
                }, 1000);
                
                return isbn;
            } else {
                console.log('❌ Aucun ISBN trouvé dans l\'image');
                uploadBtn.textContent = '❌ Non trouvé';
                alert('Aucun ISBN détecté dans cette image.\n\nConseil: Assurez-vous que:\n- L\'ISBN est bien visible (pas le code-barres)\n- La photo est nette et bien éclairée\n- L\'ISBN est en entier sur la photo');
                return null;
            }

        } catch (error) {
            console.error('❌ Erreur analyse image:', error);
            uploadBtn.textContent = '❌ Erreur';
            alert('Erreur lors de la reconnaissance de texte: ' + error.message);
            return null;
        } finally {
            setTimeout(() => {
                uploadBtn.disabled = false;
                uploadBtn.textContent = originalText;
            }, 3000);
        }
    }

    /**
     * Convertir un fichier en objet Image
     */
    async fileToImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    console.log('📸 Image chargée avec succès');
                    resolve(img);
                };
                img.onerror = (error) => {
                    console.error('❌ Erreur lors du chargement de l\'image:', error);
                    reject(error);
                };
                img.src = e.target.result;
            };
            reader.onerror = (error) => {
                console.error('❌ Erreur lors de la lecture du fichier:', error);
                reject(error);
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Reconnaissance ISBN à partir d'un canvas
     */
    async recognizeISBNFromCanvas(canvas, progressCallback) {
        try {
            // Vérifier que Tesseract est disponible
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js n\'est pas chargé. Vérifiez que le script est inclus.');
            }

            console.log('🤖 Début reconnaissance Tesseract depuis canvas');
            
            const result = await Tesseract.recognize(canvas, 'eng', {
                logger: (m) => {
                    console.log('📝 Tesseract log:', m);
                    if (m.status === 'recognizing text' && progressCallback) {
                        progressCallback(m.progress);
                    }
                },
                tessedit_char_whitelist: '0123456789X-',
                tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
            });

            const text = result.data.text;
            console.log('📖 Texte reconnu (caméra):', text);
            
            return this.extractISBNFromText(text);
            
        } catch (error) {
            console.error('❌ Erreur Tesseract (canvas):', error);
            throw error;
        }
    }

    /**
     * Reconnaissance ISBN à partir d'une image
     */
    async recognizeISBNFromImage(img, progressCallback) {
        try {
            // Vérifier que Tesseract est disponible
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js n\'est pas chargé. Vérifiez que le script est inclus dans index.html.');
            }

            console.log('🤖 Début reconnaissance Tesseract depuis image');
            
            const result = await Tesseract.recognize(img, 'eng', {
                logger: (m) => {
                    console.log('📝 Tesseract log:', m);
                    if (m.status === 'recognizing text' && progressCallback) {
                        progressCallback(m.progress);
                    }
                },
                tessedit_char_whitelist: '0123456789X-',
                tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
            });

            const text = result.data.text;
            console.log('📖 Texte reconnu (image):', text);
            
            return this.extractISBNFromPhotoText(text);
            
        } catch (error) {
            console.error('❌ Erreur Tesseract (image):', error);
            throw error;
        }
    }

    /**
     * Extraire l'ISBN du texte reconnu (caméra)
     */
    extractISBNFromText(text) {
        const cleanText = text.replace(/\s+/g, '').replace(/[^\d\-]/g, '');
        
        // Pattern pour ISBN-13
        const isbn13Pattern = /(\d{3}[\-]?\d{1}[\-]?\d{3}[\-]?\d{5}[\-]?\d{1})/;
        // Pattern pour ISBN-10
        const isbn10Pattern = /(\d{1}[\-]?\d{3}[\-]?\d{5}[\-]?[\dX]{1})/;
        
        // Chercher ISBN-13 complet
        let match = text.match(/97[89]\d{10}/);
        if (match) {
            const isbn = match[0];
            return this.formatISBN(isbn);
        }
        
        // Chercher ISBN-10
        match = cleanText.match(isbn10Pattern);
        if (match) {
            const isbn = match[1].replace(/[\-]/g, '');
            if (isbn.length === 10) {
                return this.formatISBN(isbn);
            }
        }
        
        // Chercher tous les nombres et voir s'il y en a un qui ressemble à un ISBN
        const allNumbers = text.match(/\d+/g);
        if (allNumbers) {
            for (let num of allNumbers) {
                if (num.length === 13 && (num.startsWith('978') || num.startsWith('979'))) {
                    return this.formatISBN(num);
                }
            }
        }
        
        return null;
    }

    /**
     * Extraire l'ISBN du texte d'une photo uploadée
     */
    extractISBNFromPhotoText(text) {
        console.log('Analyse du texte photo:', text);
        
        const lines = text.split('\n');
        
        // Analyser ligne par ligne
        for (let line of lines) {
            // Ignorer les lignes qui ressemblent à des codes-barres
            if (line.match(/^\d{12,}$/)) {
                console.log('Ligne ignorée (code-barres probable):', line);
                continue;
            }
            
            const isbn = this.findISBNInLine(line);
            if (isbn) {
                console.log('ISBN trouvé dans la ligne:', line, '-> ISBN:', isbn);
                return isbn;
            }
        }
        
        // Si rien trouvé ligne par ligne, analyser tout le texte
        return this.findISBNInLine(text);
    }

    /**
     * Trouver un ISBN dans une ligne de texte
     */
    findISBNInLine(line) {
        const cleaned = line.replace(/[^\d\-X\s]/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Patterns pour ISBN-13
        const isbn13Patterns = [
            /\b(978[\s\-]?\d[\s\-]?\d{2}[\s\-]?\d{6}[\s\-]?\d)\b/g,
            /\b(979[\s\-]?\d[\s\-]?\d{2}[\s\-]?\d{6}[\s\-]?\d)\b/g,
            /\b(978\d{10})\b/g,
            /\b(979\d{10})\b/g
        ];
        
        // Patterns pour ISBN-10
        const isbn10Patterns = [
            /\b(\d[\s\-]?\d{2}[\s\-]?\d{6}[\s\-]?[\dX])\b/g,
            /\b(\d{9}[\dX])\b/g
        ];
        
        // Chercher ISBN-13 d'abord
        for (let pattern of isbn13Patterns) {
            const matches = [...cleaned.matchAll(pattern)];
            for (let match of matches) {
                const potentialISBN = match[1].replace(/[\s\-]/g, '');
                if (potentialISBN.length === 13) {
                    return this.formatISBN(potentialISBN);
                }
            }
        }
        
        // Puis ISBN-10
        for (let pattern of isbn10Patterns) {
            const matches = [...cleaned.matchAll(pattern)];
            for (let match of matches) {
                const potentialISBN = match[1].replace(/[\s\-]/g, '');
                if (potentialISBN.length === 10) {
                    // Éviter les numéros qui commencent par 0 ou 1 (probablement pas des ISBN)
                    if (!potentialISBN.match(/^[01]/)) {
                        return this.formatISBN(potentialISBN);
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Formater un ISBN pour l'affichage
     */
    formatISBN(isbn) {
        const clean = isbn.replace(/[^\dX]/g, '');
        
        if (clean.length === 13) {
            return `${clean.slice(0,3)}-${clean.slice(3,4)}-${clean.slice(4,6)}-${clean.slice(6,12)}-${clean.slice(12)}`;
        } else if (clean.length === 10) {
            return `${clean.slice(0,1)}-${clean.slice(1,3)}-${clean.slice(3,9)}-${clean.slice(9)}`;
        }
        
        return clean;
    }

    /**
     * Vérifier si la caméra est supportée
     */
    isCameraSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Nettoyer les ressources
     */
    cleanup() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        if (this.tesseractWorker) {
            this.tesseractWorker.terminate();
            this.tesseractWorker = null;
        }
        
        this.isScanning = false;
    }
}

// Instance globale du scanner
const isbnScanner = new ISBNScanner();

// Fonctions globales pour la compatibilité avec l'HTML existant
function startISBNScan() {
    isbnScanner.startCameraScan();
}

function stopISBNScan() {
    isbnScanner.stopCameraScan();
}

function captureISBN() {
    isbnScanner.captureAndAnalyze();
}

function analyzeISBNPhoto(event) {
    const file = event.target.files[0];
    if (file) {
        console.log('📁 Fichier sélectionné:', file.name);
        isbnScanner.analyzeUploadedImage(file);
    } else {
        console.log('❌ Aucun fichier sélectionné');
    }
    // Réinitialiser l'input pour permettre de sélectionner le même fichier
    event.target.value = '';
}

console.log('📷 Scanner ISBN initialisé');