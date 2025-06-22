/**
 * Application principale ISBN Search
 * Orchestre tous les services et gère les interactions utilisateur
 */
class ISBNSearchApp {
    constructor() {
        this.currentBook = null;
        this.isInitialized = false;
        this.init();
    }

    /**
     * Initialiser l'application
     */
    async init() {
        try {
            console.log('Initialisation de l\'application ISBN Search...');
            
            // Attendre que le DOM soit chargé
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
            } else {
                this.setupEventListeners();
            }
            
            // Vérifier les capacités de l'appareil
            await this.checkDeviceCapabilities();
            
            // Préremplir avec un exemple
            this.setDefaultISBN();
            
            this.isInitialized = true;
            console.log('Application initialisée avec succès');
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation:', error);
            ui.showError('Erreur lors du chargement de l\'application');
        }
    }

    /**
     * Configurer les écouteurs d'événements
     */
    setupEventListeners() {
        // Input ISBN avec validation et formatting
        const isbnInput = document.getElementById('isbnInput');
        if (isbnInput) {
            isbnInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchBook();
                }
            });

            isbnInput.addEventListener('input', (e) => {
                this.formatISBNInput(e);
            });

            isbnInput.addEventListener('paste', (e) => {
                setTimeout(() => this.formatISBNInput(e), 10);
            });
        }

        // Gestion de la fermeture de modal avec Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('cameraModal');
                if (modal && modal.style.display === 'flex') {
                    stopISBNScan();
                }
            }
        });

        // Gestion des erreurs globales
        window.addEventListener('error', (e) => {
            console.error('Erreur JavaScript:', e.error);
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('Promise rejetée:', e.reason);
        });

        console.log('Écouteurs d\'événements configurés');
    }

    /**
     * Formater l'input ISBN en temps réel
     */
    formatISBNInput(e) {
        let value = e.target.value.replace(/[^\d]/g, '');
        
        // Limiter à 13 chiffres
        if (value.length > 13) {
            value = value.substring(0, 13);
        }
        
        // Formater avec des tirets pour ISBN-13
        if (value.length >= 3) {
            value = value.substring(0, 3) + '-' + value.substring(3);
        }
        if (value.length >= 6) {
            value = value.substring(0, 6) + '-' + value.substring(6);
        }
        if (value.length >= 13) {
            value = value.substring(0, 13) + '-' + value.substring(13);
        }
        if (value.length >= 20) {
            value = value.substring(0, 20) + '-' + value.substring(20);
        }
        
        e.target.value = value;
    }

    /**
     * Vérifier les capacités de l'appareil
     */
    async checkDeviceCapabilities() {
        try {
            // Vérifier le support de la caméra
            const cameraSupported = isbnScanner.isCameraSupported();
            const scanBtn = document.getElementById('scanBtn');
            
            if (!cameraSupported && scanBtn) {
                scanBtn.disabled = true;
                scanBtn.textContent = '📷 Non supporté';
                scanBtn.title = 'La caméra n\'est pas supportée sur cet appareil';
            }

            // Vérifier les capacités de stockage
            this.checkStorageCapacity();
            
            console.log('Capacités de l\'appareil vérifiées');
            
        } catch (error) {
            console.error('Erreur lors de la vérification des capacités:', error);
        }
    }

    /**
     * Vérifier la capacité de stockage
     */
    checkStorageCapacity() {
        try {
            const testKey = 'storage_test';
            const testValue = 'test';
            localStorage.setItem(testKey, testValue);
            localStorage.removeItem(testKey);
            
            // Estimer l'espace utilisé
            const dbSize = JSON.stringify(bookDatabase.data).length;
            const sizeInMB = (dbSize / (1024 * 1024)).toFixed(2);
            
            console.log(`Base de données: ${sizeInMB}MB, ${bookDatabase.getBookCount()} livres`);
            
        } catch (error) {
            console.error('Problème de stockage local:', error);
            ui.showError('Attention: Le stockage local pourrait être limité');
        }
    }

    /**
     * Définir l'ISBN par défaut
     */
    setDefaultISBN() {
        const isbnInput = document.getElementById('isbnInput');
        if (isbnInput && !isbnInput.value) {
            isbnInput.value = '978-2-401-08462-9';
        }
    }

    /**
     * Rechercher un livre par ISBN
     */
    async searchBook() {
        const isbnInput = document.getElementById('isbnInput');
        const isbn = isbnInput.value.trim();

        if (!isbn) {
            ui.showError('Veuillez entrer un ISBN');
            return;
        }

        // Valider l'ISBN
        const validation = bookAPI.validateISBN(isbn);
        if (!validation.valid) {
            ui.showError(validation.error);
            return;
        }

        // Annuler toute recherche en cours
        bookAPI.cancelCurrentSearch();

        // Afficher le loading
        ui.showLoading(true);

        try {
            // Rechercher le livre
            const result = await bookAPI.searchByISBN(validation.isbn);

            if (result.success) {
                this.currentBook = result.data;

                // Gestion de l'easter egg
                if (result.source === 'easter_egg') {
                    ui.activateDemonMode();
                }

                // Afficher le résultat
                ui.showSuccess(`Livre trouvé ${result.source === 'cache' ? 'en cache' : 'via API'} pour l'ISBN: ${validation.isbn}`);
                ui.displayBook(result.data);

            } else {
                console.log('Livre non trouvé, affichage de l\'invite de contribution');
                ui.showNotFoundPrompt(validation.isbn);
            }

        } catch (error) {
            console.error('Erreur lors de la recherche:', error);
            ui.showError(`Erreur lors de la recherche: ${error.message}`);
        } finally {
            ui.showLoading(false);
        }
    }

    /**
     * Définir un ISBN d'exemple et lancer la recherche
     */
    setISBN(isbn) {
        const isbnInput = document.getElementById('isbnInput');
        if (isbnInput) {
            isbnInput.value = isbn;
            this.searchBook();
        }
    }

    /**
     * Retourner à l'accueil
     */
    goHome() {
        // Nettoyer l'affichage
        document.getElementById('results').innerHTML = '';
        
        // Réinitialiser l'input
        const isbnInput = document.getElementById('isbnInput');
        if (isbnInput) {
            isbnInput.value = '978-2-401-08462-9';
            isbnInput.focus();
        }
        
        // Désactiver le mode démon si actif
        if (ui.isDemonMode) {
            ui.deactivateDemonMode();
        }
        
        // Masquer le loading
        ui.showLoading(false);
        
        // Nettoyer les variables
        this.currentBook = null;
    }

    /**
     * Gérer l'upload de couverture de livre
     */
    async handleBookCoverUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const validation = imageService.validateImageFile(file);
            if (!validation.valid) {
                alert(validation.error);
                return;
            }

            // Convertir en base64
            const imageData = await imageService.fileToBase64(file);
            
            // Afficher la nouvelle couverture
            const coverDiv = document.querySelector('.book-cover');
            if (coverDiv) {
                coverDiv.innerHTML = `<img src="${imageData}" alt="Couverture" style="max-width: 150px; height: auto; border: 2px solid var(--black);">`;
            }

            // Mettre à jour les données du livre
            if (this.currentBook && this.currentBook.volumeInfo) {
                if (!this.currentBook.volumeInfo.imageLinks) {
                    this.currentBook.volumeInfo.imageLinks = {};
                }
                this.currentBook.volumeInfo.imageLinks.thumbnail = imageData;

                // Sauvegarder dans la base de données
                const isbn = this.getISBNFromCurrentBook();
                if (isbn) {
                    const existingBook = bookDatabase.findBook(isbn);
                    const bookToSave = existingBook || {
                        ...this.currentBook.volumeInfo,
                        source: 'google_api'
                    };

                    const updatedBook = {
                        ...bookToSave,
                        imageLinks: {
                            ...(bookToSave.imageLinks || {}),
                            thumbnail: imageData
                        },
                        lastUpdated: new Date().toISOString(),
                        coverSource: 'user_uploaded'
                    };

                    bookDatabase.addBook(isbn, updatedBook);
                    ui.showCoverUploadSuccess();
                    
                    console.log('Couverture sauvegardée avec succès pour ISBN:', isbn);
                } else {
                    console.error('Impossible de trouver l\'ISBN pour sauvegarder la couverture');
                    alert('Erreur: Impossible de sauvegarder la couverture (ISBN non trouvé)');
                }
            }

        } catch (error) {
            console.error('Erreur lors de l\'upload de couverture:', error);
            alert('Erreur lors du traitement de l\'image');
        }
    }

    /**
     * Extraire l'ISBN du livre actuel
     */
    getISBNFromCurrentBook() {
        if (!this.currentBook || !this.currentBook.volumeInfo) {
            return null;
        }

        // Méthode 1: Depuis les industryIdentifiers
        if (this.currentBook.volumeInfo.industryIdentifiers) {
            for (let identifier of this.currentBook.volumeInfo.industryIdentifiers) {
                if (identifier.type === 'ISBN_13' || identifier.type === 'ISBN_10' || identifier.type.includes('ISBN')) {
                    return identifier.identifier.replace(/[-\s]/g, '');
                }
            }
        }

        // Méthode 2: Depuis l'input ISBN actuel
        const isbnInput = document.getElementById('isbnInput');
        if (isbnInput && isbnInput.value) {
            return isbnInput.value.replace(/[-\s]/g, '');
        }

        return null;
    }

    /**
     * Obtenir des statistiques sur l'utilisation
     */
    getAppStats() {
        return {
            booksInDatabase: bookDatabase.getBookCount(),
            appVersion: '2.0.0',
            lastUsed: localStorage.getItem('lastUsed') || 'Jamais',
            searchesCount: parseInt(localStorage.getItem('searchesCount')) || 0
        };
    }

    /**
     * Incrémenter le compteur de recherches
     */
    incrementSearchCount() {
        const currentCount = parseInt(localStorage.getItem('searchesCount')) || 0;
        localStorage.setItem('searchesCount', (currentCount + 1).toString());
        localStorage.setItem('lastUsed', new Date().toISOString());
    }

    /**
     * Nettoyer les ressources avant fermeture
     */
    cleanup() {
        try {
            // Nettoyer le scanner
            isbnScanner.cleanup();
            
            // Annuler les requêtes en cours
            bookAPI.cancelCurrentSearch();
            
            // Sauvegarder une dernière fois
            bookDatabase.saveDatabase();
            
            console.log('Nettoyage de l\'application terminé');
            
        } catch (error) {
            console.error('Erreur lors du nettoyage:', error);
        }
    }

    /**
     * Exporter les données utilisateur
     */
    exportUserData() {
        try {
            const exportData = bookDatabase.exportDatabase();
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `isbn-search-backup-${new Date().toISOString().slice(0,10)}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            ui.showSuccess('Données exportées avec succès');
            
        } catch (error) {
            console.error('Erreur lors de l\'export:', error);
            ui.showError('Erreur lors de l\'export des données');
        }
    }

    /**
     * Importer des données utilisateur
     */
    importUserData(file) {
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);
                    const success = bookDatabase.importDatabase(importData);
                    
                    if (success) {
                        ui.showSuccess(`Données importées: ${Object.keys(importData.books).length} livres ajoutés`);
                    } else {
                        ui.showError('Format de fichier invalide');
                    }
                } catch (error) {
                    console.error('Erreur lors du parsing:', error);
                    ui.showError('Fichier de sauvegarde invalide');
                }
            };
            reader.readAsText(file);
            
        } catch (error) {
            console.error('Erreur lors de l\'import:', error);
            ui.showError('Erreur lors de l\'import des données');
        }
    }
}

// Instance globale de l'application
const app = new ISBNSearchApp();

// Fonctions globales pour la compatibilité avec l'HTML existant
function searchBook() {
    app.incrementSearchCount();
    app.searchBook();
}

function setISBN(isbn) {
    app.setISBN(isbn);
}

function goHome() {
    app.goHome();
}

function handleBookCoverUpload(event) {
    app.handleBookCoverUpload(event);
}

// Gestionnaire de fermeture de l'application
window.addEventListener('beforeunload', () => {
    app.cleanup();
});

// Gestion des erreurs globales non capturées
window.addEventListener('error', (event) => {
    console.error('Erreur non capturée:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise rejetée non gérée:', event.reason);
});

console.log('Application ISBN Search chargée et prête à l\'utilisation');