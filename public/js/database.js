/**
 * Gestionnaire de base de données locale pour les livres ISBN
 * Utilise localStorage pour la persistance des données
 */
class BookDatabase {
    constructor() {
        this.dbName = 'isbnBookDatabase';
        this.data = {};
        this.loadDatabase();
    }

    /**
     * Charger la base de données depuis localStorage
     */
    loadDatabase() {
        try {
            const saved = localStorage.getItem(this.dbName);
            if (saved) {
                this.data = JSON.parse(saved);
                console.log(`Base de données chargée: ${Object.keys(this.data).length} livres`);
            } else {
                console.log('Nouvelle base de données créée');
            }
        } catch (error) {
            console.error('Erreur lors du chargement de la base:', error);
            this.data = {};
        }
    }

    /**
     * Sauvegarder la base de données dans localStorage
     */
    saveDatabase() {
        try {
            localStorage.setItem(this.dbName, JSON.stringify(this.data));
            console.log(`Base de données sauvegardée: ${Object.keys(this.data).length} livres`);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            throw new Error('Impossible de sauvegarder les données');
        }
    }

    /**
     * Nettoyer l'ISBN (supprimer tirets et espaces)
     */
    cleanISBN(isbn) {
        return isbn.replace(/[-\s]/g, '');
    }

    /**
     * Convertir ISBN-10 en ISBN-13
     */
    convertISBN10ToISBN13(isbn10) {
        if (!isbn10 || isbn10.length !== 10) return null;
        
        const prefix = '978';
        const partial = prefix + isbn10.substring(0, 9);
        
        // Calculer la checksum ISBN-13
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(partial[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        
        return partial + checkDigit;
    }

    /**
     * Convertir ISBN-13 en ISBN-10 (si possible)
     */
    convertISBN13ToISBN10(isbn13) {
        if (!isbn13 || isbn13.length !== 13 || !isbn13.startsWith('978')) return null;
        
        const partial = isbn13.substring(3, 12);
        
        // Calculer la checksum ISBN-10
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(partial[i]) * (10 - i);
        }
        const checkDigit = (11 - (sum % 11)) % 11;
        
        let checkChar;
        if (checkDigit === 10) {
            checkChar = 'X';
        } else if (checkDigit === 11) {
            checkChar = '0';
        } else {
            checkChar = checkDigit.toString();
        }
        
        return partial + checkChar;
    }

    /**
     * Normaliser un ISBN en ISBN-13 (format de stockage standard)
     */
    normalizeISBN(isbn) {
        const clean = this.cleanISBN(isbn);
        
        // 🔥 EXCEPTION SPÉCIALE POUR L'EASTER EGG DIABOLIQUE 🔥
        if (clean === '6666666666666') {
            console.log('👹 Pas de normalisation pour l\'ISBN diabolique ! 666 !');
            return clean; // Garder tel quel pour préserver l'easter egg
        }
        
        if (clean.length === 13) {
            return clean; // Déjà en ISBN-13
        } else if (clean.length === 10) {
            const isbn13 = this.convertISBN10ToISBN13(clean);
            if (isbn13) {
                console.log(`🔄 Conversion ISBN-10 → ISBN-13: ${clean} → ${isbn13}`);
                return isbn13;
            }
        }
        
        return clean; // Retourner tel quel si impossible à convertir
    }

    /**
     * Obtenir toutes les variantes possibles d'un ISBN
     */
    getISBNVariants(isbn) {
        const clean = this.cleanISBN(isbn);
        const variants = new Set();
        
        // Ajouter l'ISBN original nettoyé
        variants.add(clean);
        
        // Si c'est un ISBN-13, ajouter l'ISBN-10 équivalent
        if (clean.length === 13 && clean.startsWith('978')) {
            const isbn10 = this.convertISBN13ToISBN10(clean);
            if (isbn10) variants.add(isbn10);
        }
        
        // Si c'est un ISBN-10, ajouter l'ISBN-13 équivalent
        if (clean.length === 10) {
            const isbn13 = this.convertISBN10ToISBN13(clean);
            if (isbn13) variants.add(isbn13);
        }
        
        console.log(`📚 Variantes ISBN pour ${clean}:`, Array.from(variants));
        return Array.from(variants);
    }

    /**
     * Trouver un livre par ISBN (avec toutes les variantes)
     */
    findBook(isbn) {
        console.log('🔍 Recherche dans la base pour ISBN:', isbn);
        
        const variants = this.getISBNVariants(isbn);
        
        for (const variant of variants) {
            if (this.data[variant]) {
                console.log(`✅ Livre trouvé avec la variante ${variant}`);
                return {
                    ...this.data[variant],
                    foundWithISBN: variant
                };
            }
        }
        
        console.log('❌ Aucun livre trouvé pour les variantes:', variants);
        return null;
    }

    /**
     * Ajouter ou mettre à jour un livre
     */
    addBook(isbn, bookInfo) {
        // Normaliser l'ISBN en ISBN-13 pour le stockage
        const normalizedISBN = this.normalizeISBN(isbn);
        
        console.log('💾 Ajout/Mise à jour du livre avec ISBN normalisé:', normalizedISBN);
        
        // Vérifier s'il existe déjà des données pour ce livre (toutes variantes)
        const existingBook = this.findBook(isbn);
        
        let finalBookData;
        if (existingBook) {
            // Fusionner avec les données existantes
            finalBookData = {
                ...existingBook,
                ...bookInfo,
                lastUpdated: new Date().toISOString()
            };
            console.log('🔄 Fusion avec les données existantes');
            
            // Supprimer l'ancienne entrée si elle était stockée avec un ISBN différent
            if (existingBook.foundWithISBN !== normalizedISBN) {
                console.log(`🗑️ Suppression de l'ancienne entrée ${existingBook.foundWithISBN}`);
                delete this.data[existingBook.foundWithISBN];
            }
        } else {
            // Nouvelles données
            finalBookData = {
                ...bookInfo,
                lastUpdated: new Date().toISOString(),
                source: bookInfo.source || 'unknown'
            };
        }
        
        // Stocker avec l'ISBN normalisé (ISBN-13)
        this.data[normalizedISBN] = finalBookData;
        
        this.saveDatabase();
        console.log('✅ Livre sauvegardé avec succès sous ISBN-13:', normalizedISBN);
        
        return this.data[normalizedISBN];
    }

    /**
     * Mettre à jour un champ spécifique d'un livre
     */
    updateBookField(isbn, field, value) {
        console.log(`🛠️ Mise à jour du champ ${field} pour ISBN:`, isbn);
        
        const book = this.findBook(isbn);
        if (!book) {
            console.error('❌ Livre non trouvé pour mise à jour:', isbn);
            return false;
        }
        
        // Utiliser l'ISBN normalisé pour la mise à jour
        const normalizedISBN = this.normalizeISBN(isbn);
        const currentStorageISBN = book.foundWithISBN;
        
        // Si le livre est stocké avec un ISBN différent du normalisé, le migrer
        if (currentStorageISBN !== normalizedISBN) {
            console.log(`📦 Migration de ${currentStorageISBN} vers ${normalizedISBN}`);
            
            // Copier les données vers l'ISBN normalisé
            this.data[normalizedISBN] = { ...this.data[currentStorageISBN] };
            
            // Supprimer l'ancienne entrée
            delete this.data[currentStorageISBN];
        }
        
        // Mettre à jour le champ
        this.data[normalizedISBN][field] = value;
        this.data[normalizedISBN].lastUpdated = new Date().toISOString();
        
        this.saveDatabase();
        console.log(`✅ Champ ${field} mis à jour pour l'ISBN normalisé ${normalizedISBN}`);
        
        return true;
    }

    /**
     * Supprimer un livre
     */
    deleteBook(isbn) {
        const variants = this.getISBNVariants(isbn);
        let deleted = false;
        
        for (const variant of variants) {
            if (this.data[variant]) {
                delete this.data[variant];
                deleted = true;
                console.log(`Livre supprimé avec la variante ${variant}`);
            }
        }
        
        if (deleted) {
            this.saveDatabase();
        }
        
        return deleted;
    }

    /**
     * Obtenir toutes les clés de la base
     */
    getAllISBNs() {
        return Object.keys(this.data);
    }

    /**
     * Obtenir le nombre total de livres
     */
    getBookCount() {
        return Object.keys(this.data).length;
    }

    /**
     * Exporter la base de données
     */
    exportDatabase() {
        return {
            exportDate: new Date().toISOString(),
            bookCount: this.getBookCount(),
            books: this.data
        };
    }

    /**
     * Importer une base de données
     */
    importDatabase(exportedData) {
        try {
            if (exportedData.books) {
                this.data = { ...this.data, ...exportedData.books };
                this.saveDatabase();
                console.log(`Base importée: ${Object.keys(exportedData.books).length} livres ajoutés`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Erreur lors de l\'importation:', error);
            return false;
        }
    }

    /**
     * Nettoyer la base de données (supprimer les doublons)
     */
    cleanDatabase() {
        const cleaned = {};
        const seen = new Set();
        
        for (const [isbn, book] of Object.entries(this.data)) {
            const variants = this.getISBNVariants(isbn);
            
            // Vérifier si on a déjà vu ce livre (par une de ses variantes)
            const alreadySeen = variants.some(variant => seen.has(variant));
            
            if (!alreadySeen) {
                // Prendre l'ISBN-13 de préférence, sinon l'ISBN original
                const preferredISBN = variants.find(v => v.length === 13) || isbn;
                cleaned[preferredISBN] = book;
                
                // Marquer toutes les variantes comme vues
                variants.forEach(variant => seen.add(variant));
            }
        }
        
        const oldCount = Object.keys(this.data).length;
        const newCount = Object.keys(cleaned).length;
        
        this.data = cleaned;
        this.saveDatabase();
        
        console.log(`Base nettoyée: ${oldCount} -> ${newCount} livres (${oldCount - newCount} doublons supprimés)`);
        return oldCount - newCount;
    }

    /**
     * Rechercher des livres par titre ou auteur
     */
    searchBooks(query) {
        const searchTerm = query.toLowerCase();
        const results = [];
        
        for (const [isbn, book] of Object.entries(this.data)) {
            const title = (book.title || '').toLowerCase();
            const authors = (book.authors || []).join(' ').toLowerCase();
            const publisher = (book.publisher || '').toLowerCase();
            
            if (title.includes(searchTerm) || 
                authors.includes(searchTerm) || 
                publisher.includes(searchTerm)) {
                results.push({
                    isbn,
                    ...book,
                    score: this.calculateRelevanceScore(book, searchTerm)
                });
            }
        }
        
        // Trier par score de pertinence
        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculer un score de pertinence pour la recherche
     */
    calculateRelevanceScore(book, searchTerm) {
        let score = 0;
        const title = (book.title || '').toLowerCase();
        const authors = (book.authors || []).join(' ').toLowerCase();
        
        // Score plus élevé si le terme est dans le titre
        if (title.includes(searchTerm)) score += 10;
        if (title.startsWith(searchTerm)) score += 5;
        
        // Score pour les auteurs
        if (authors.includes(searchTerm)) score += 8;
        if (authors.startsWith(searchTerm)) score += 3;
        
        return score;
    }
}

// Instance globale de la base de données
const bookDatabase = new BookDatabase();
            