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

            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js n\'est pas chargé.');
            }

            const img = await this.fileToImage(file);
            console.log('🖼️ Image convertie:', img.width, 'x', img.height);
            
            // Analyser l'image avec tentatives de rotation
            const isbn = await this.recognizeISBNFromImage(img, (attempt, progress) => {
                const percentage = Math.round(progress * 100);
                uploadBtn.textContent = `📁 ${attempt}/4: ${percentage}%`;
                console.log(`📊 Progression OCR (essai ${attempt}): ${percentage}%`);
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
            
            const result = await Tesseract.recognize(canvas, 'eng+fra', {
                logger: (m) => {
                    if (m.status === 'recognizing text' && progressCallback) {
                        progressCallback(m.progress);
                    }
                },
                tessedit_char_whitelist: '0123456789-Xx', // Xx pour la fin des ISBN-10
            });

            const text = result.data.text;
            console.log('📖 Texte reconnu (caméra):', text);
            
            return this.extractISBN(text);
            
        } catch (error) {
            console.error('❌ Erreur Tesseract (canvas):', error);
            throw error;
        }
    }

    /**
     * Reconnaissance ISBN à partir d'une image, avec 4 tentatives de rotation.
     */
    async recognizeISBNFromImage(img, progressCallback) {
        try {
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js n\'est pas chargé. Vérifiez que le script est inclus dans index.html.');
            }
            
            const angles = [0, 90, 180, 270];
            let attempt = 0;

            for (const angle of angles) {
                attempt++;
                console.log(`🌀 Tentative ${attempt}/${angles.length}: Rotation à ${angle}°`);

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Inverser largeur/hauteur pour les rotations de 90/270
                if (angle === 90 || angle === 270) {
                    canvas.width = img.height;
                    canvas.height = img.width;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }

                // Placer le point d'origine au centre, pivoter, puis dessiner l'image
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(angle * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);

                const result = await Tesseract.recognize(canvas, 'eng+fra', {
                    logger: (m) => {
                        if (m.status === 'recognizing text' && progressCallback) {
                            progressCallback(attempt, m.progress);
                        }
                    },
                    tessedit_char_whitelist: '0123456789-Xx',
                });

                const text = result.data.text;
                console.log(`📖 Texte reconnu (rotation ${angle}°):`, text.substring(0, 100) + '...');
                const isbn = this.extractISBN(text);

                if (isbn) {
                    console.log(`✅ ISBN trouvé avec une rotation de ${angle}°`);
                    return isbn;
                }
            }
            
            console.log('❌ Aucun ISBN trouvé après toutes les rotations.');
            return null;

        } catch (error) {
            console.error('❌ Erreur Tesseract (image):', error);
            throw error;
        }
    }
    
    /**
     * Extrait un ISBN (10 ou 13) d'une chaîne de texte avec une regex.
     * @param {string} text - Le texte brut reconnu par l'OCR.
     * @returns {string|null} L'ISBN nettoyé ou null.
     */
    extractISBN(text) {
        console.log('🔍 Recherche d\'ISBN dans le texte:', text);
        
        // Regex pour trouver un ISBN-13 (avec ou sans préfixe "ISBN")
        // Prend en compte les tirets optionnels
        // 978-x-xxx-xxxxx-x ou 979-x-xxx-xxxxx-x
        const isbn13Regex = /(?:ISBN-13:?\s*)?(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?\d)/g;
        
        // Regex pour un ISBN-10
        // x-xxx-xxxxx-x
        const isbn10Regex = /(?:ISBN-10:?\s*)?(\d[-\s]?\d{3}[-\s]?\d{5}[-\s]?[0-9X_x])/g;

        const lines = text.split('\n');
        for (const line of lines) {
            let match;
            
            // Chercher d'abord un ISBN-13, plus courant
            match = isbn13Regex.exec(line);
            if (match && match[1]) {
                const isbn = match[1].replace(/[-\s]/g, ''); // Nettoyer
                console.log('✅ ISBN-13 trouvé et nettoyé:', isbn);
                if (isbn.length === 13) return isbn;
            }

            // Si pas d'ISBN-13, chercher un ISBN-10
            match = isbn10Regex.exec(line);
            if (match && match[1]) {
                const isbn = match[1].replace(/[-\s]/g, ''); // Nettoyer
                console.log('✅ ISBN-10 trouvé et nettoyé:', isbn);
                if (isbn.length === 10) return isbn;
            }
        }

        console.log('❌ Aucun ISBN valide trouvé dans le texte.');
        return null;
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