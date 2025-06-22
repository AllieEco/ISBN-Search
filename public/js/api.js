/**
 * Service API pour la recherche de livres
 * Gère les appels aux APIs externes et la logique de recherche
 */
class BookAPIService {
    constructor() {
        this.currentRequest = null;
        this.requestTimeout = 10000; // 10 secondes
    }

    /**
     * Rechercher un livre par ISBN
     */
    async searchByISBN(isbn) {
        const cleanISBN = isbn.replace(/[-\s]/g, '');
        
        // 1. Vérifier d'abord dans la base locale
        const cachedBook = bookDatabase.findBook(cleanISBN);
        if (cachedBook) {
            console.log('Livre trouvé en cache pour ISBN:', cleanISBN);
            return {
                success: true,
                source: 'cache',
                data: this.formatBookData(cachedBook)
            };
        }

        // 2. Easter egg diabolique
        if (cleanISBN === '6666666666666') {
            return this.getDemonBook();
        }

        // 3. Rechercher via l'API Google Books
        console.log('Recherche via API Google Books pour ISBN:', cleanISBN);
        
        try {
            const result = await this.searchGoogleBooks(cleanISBN);
            
            if (result.success && result.data) {
                // Sauvegarder en cache
                bookDatabase.addBook(cleanISBN, {
                    ...result.data.volumeInfo,
                    source: 'google_api'
                });
                
                return result;
            }
            
            return {
                success: false,
                error: 'Livre non trouvé',
                isbn: cleanISBN
            };
            
        } catch (error) {
            console.error('Erreur lors de la recherche API:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Rechercher via l'API Google Books
     */
    async searchGoogleBooks(isbn) {
        // Annuler la requête précédente si elle existe
        if (this.currentRequest) {
            this.currentRequest.abort();
        }

        const controller = new AbortController();
        this.currentRequest = controller;

        try {
            // Essayer les services dans l'ordre de fiabilité
            const services = [
                {
                    name: 'Backend local',
                    url: `/api/external/google/${isbn}`,
                    type: 'local'
                },
                {
                    name: 'corsproxy.io',
                    url: `https://corsproxy.io/?${encodeURIComponent(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)}`,
                    type: 'proxy'
                },
                {
                    name: 'cors.sh',
                    url: `https://cors.sh/https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
                    type: 'proxy'
                },
                {
                    name: 'API directe (peut échouer)',
                    url: `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
                    type: 'direct'
                }
            ];

            for (let i = 0; i < services.length; i++) {
                const service = services[i];
                console.log(`📡 Tentative ${i + 1}/${services.length} avec ${service.name}`);

                try {
                    const response = await fetch(service.url, {
                        signal: controller.signal,
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = await response.json();
                    console.log(`✅ Réponse reçue de ${service.name}:`, data);

                    // Gérer les différents formats de réponse
                    let bookData;
                    if (service.type === 'local' && data.success && data.items) {
                        // Réponse de notre serveur
                        bookData = { items: data.items };
                    } else if (data.items) {
                        // Réponse directe de Google Books
                        bookData = data;
                    } else if (data.contents) {
                        // Réponse de certains proxies
                        bookData = JSON.parse(data.contents);
                    } else {
                        bookData = data;
                    }

                    if (bookData.items && bookData.items.length > 0) {
                        console.log(`🎉 Livre trouvé via ${service.name}!`);
                        return {
                            success: true,
                            source: service.name,
                            data: bookData.items[0]
                        };
                    } else {
                        console.log(`📭 Aucun résultat avec ${service.name}`);
                    }

                } catch (error) {
                    console.log(`❌ ${service.name} a échoué:`, error.message);
                    
                    // Si c'est le dernier service et qu'il échoue, on throw l'erreur
                    if (i === services.length - 1) {
                        throw new Error(`Tous les services ont échoué. Dernière erreur: ${error.message}`);
                    }
                    
                    // Sinon on continue avec le service suivant
                    continue;
                }
            }

            // Si on arrive ici, aucun service n'a trouvé de résultat
            return {
                success: false,
                error: 'Aucun résultat trouvé dans tous les services'
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Recherche annulée');
            }
            console.error('🚨 Erreur finale:', error.message);
            throw error;
        } finally {
            this.currentRequest = null;
        }
    }

    /**
     * Formater les données du livre pour l'affichage
     */
    formatBookData(bookInfo) {
        return {
            volumeInfo: {
                title: bookInfo.title || 'Titre inconnu',
                authors: bookInfo.authors || [],
                publisher: bookInfo.publisher || null,
                publishedDate: bookInfo.publishedDate || null,
                pageCount: bookInfo.pageCount || null,
                categories: bookInfo.categories || ['Inconnue'],
                language: bookInfo.language || 'unknown',
                description: bookInfo.description || null,
                industryIdentifiers: bookInfo.industryIdentifiers || [],
                imageLinks: bookInfo.imageLinks || null
            }
        };
    }

    /**
     * Easter egg: livre diabolique
     */
    getDemonBook() {
        return {
            success: true,
            source: 'easter_egg',
            data: {
                volumeInfo: {
                    title: '666: Le Livre Maudit',
                    authors: ['666', 'Démon 666', 'Satan 666'],
                    publisher: '666 Éditions Infernales',
                    publishedDate: '666',
                    pageCount: 666,
                    categories: ['666', 'Diabolique', 'Maudit'],
                    language: 'demon',
                    description: '666 fois maudit, ce livre contient 666 pages de pur mal. Quiconque le lit sera maudit 666 fois par 666 démons pendant 666 jours. Les 666 chapitres racontent 666 histoires terrifiantes avec 666 personnages démoniaques. Attention: ce livre est réservé aux âmes perdues et aux collectionneurs de livres maudits. 666 666 666 !',
                    industryIdentifiers: [
                        { type: "ISBN_666", identifier: "6666666666666" }
                    ],
                    imageLinks: null
                }
            }
        };
    }

    /**
     * Annuler la recherche en cours
     */
    cancelCurrentSearch() {
        if (this.currentRequest) {
            this.currentRequest.abort();
            this.currentRequest = null;
        }
    }

    /**
     * Rechercher des informations supplémentaires sur un livre
     */
    async enrichBookData(isbn, currentData) {
        try {
            // Tentative d'enrichissement via d'autres sources
            // (OpenLibrary, WorldCat, etc.)
            
            // Pour l'instant, retourner les données existantes
            return currentData;
            
        } catch (error) {
            console.error('Erreur lors de l\'enrichissement:', error);
            return currentData;
        }
    }

    /**
     * Valider un ISBN
     */
    validateISBN(isbn) {
        const clean = isbn.replace(/[-\s]/g, '');
        
        // 🔥 EXCEPTION SPÉCIALE POUR L'EASTER EGG DIABOLIQUE 🔥
        if (clean === '6666666666666') {
            console.log('👹 Easter egg diabolique détecté ! 666 !');
            return { valid: true, isbn: clean };
        }
        
        // Vérifier la longueur
        if (clean.length !== 10 && clean.length !== 13) {
            return { valid: false, error: 'L\'ISBN doit contenir 10 ou 13 chiffres' };
        }
        
        // Vérifier que ce sont des chiffres (sauf X pour ISBN-10)
        if (clean.length === 10) {
            if (!/^\d{9}[\dX]$/.test(clean)) {
                return { valid: false, error: 'Format ISBN-10 invalide' };
            }
        } else {
            if (!/^\d{13}$/.test(clean)) {
                return { valid: false, error: 'Format ISBN-13 invalide' };
            }
            
            // Vérifier le préfixe pour ISBN-13 (SAUF pour l'easter egg)
            if (!clean.startsWith('978') && !clean.startsWith('979')) {
                return { valid: false, error: 'ISBN-13 doit commencer par 978 ou 979' };
            }
        }
        
        return { valid: true, isbn: clean };
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
}

/**
 * Service pour la gestion des images et couvertures
 */
class ImageService {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    }

    /**
     * Valider un fichier image
     */
    validateImageFile(file) {
        if (file.size > this.maxFileSize) {
            return { valid: false, error: 'L\'image est trop lourde (max 5MB)' };
        }
        
        if (!this.allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Format d\'image non supporté (JPG, PNG, WebP uniquement)' };
        }
        
        return { valid: true };
    }

    /**
     * Convertir un fichier en base64
     */
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Redimensionner une image si nécessaire
     */
    async resizeImage(file, maxWidth = 300, maxHeight = 400) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                const { width, height } = this.calculateNewDimensions(
                    img.width, img.height, maxWidth, maxHeight
                );
                
                canvas.width = width;
                canvas.height = height;
                
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(resolve, 'image/jpeg', 0.8);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Calculer les nouvelles dimensions en gardant le ratio
     */
    calculateNewDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
        let width = originalWidth;
        let height = originalHeight;
        
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }
        
        return { width: Math.round(width), height: Math.round(height) };
    }
}

// Instances globales des services
const bookAPI = new BookAPIService();
const imageService = new ImageService();