/**
 * Serveur backend pour ISBN Search
 * Version simplifiée et corrigée
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fetch = require('node-fetch');

class ISBNServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.dbFile = path.join(__dirname, 'data', 'books.json'); // Utiliser books.json existant
        this.books = {};
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Configurer les middlewares
     */
    setupMiddleware() {
        // Sécurité basique
        this.app.use(helmet({
            contentSecurityPolicy: false // Désactiver CSP pour éviter les problèmes
        }));
        
        // CORS
        this.app.use(cors());

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limite de 100 requêtes par IP
            message: {
                error: 'Trop de requêtes, veuillez réessayer plus tard'
            }
        });
        this.app.use('/api/', limiter);

        // Parsing JSON
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Servir les fichiers statiques depuis le dossier public
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Logging simple
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Configurer les routes
     */
    setupRoutes() {
        // Routes API
        this.app.get('/api/health', this.healthCheck.bind(this));
        this.app.get('/api/books/:isbn', this.getBook.bind(this));
        this.app.post('/api/books', this.createBook.bind(this));
        this.app.put('/api/books/:isbn', this.updateBook.bind(this));
        this.app.delete('/api/books/:isbn', this.deleteBook.bind(this));
        this.app.get('/api/books', this.searchBooks.bind(this));
        this.app.get('/api/stats', this.getStats.bind(this));
        
        // Route pour synchroniser avec localStorage
        this.app.post('/api/sync/import', this.importFromLocalStorage.bind(this));
        this.app.get('/api/sync/export', this.exportToLocalStorage.bind(this));

        // Routes spéciales
        this.app.post('/api/books/:isbn/cover', this.uploadCover.bind(this));
        this.app.get('/api/external/google/:isbn', this.searchGoogleBooks.bind(this));

        // Route pour servir l'application
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Gestionnaire d'erreurs
        this.app.use(this.errorHandler.bind(this));
    }

    /**
     * Charger la base de données
     */
    async loadDatabase() {
        try {
            // Créer le dossier data s'il n'existe pas
            await fs.mkdir(path.dirname(this.dbFile), { recursive: true });
            
            // Charger le fichier JSON
            const data = await fs.readFile(this.dbFile, 'utf8');
            this.books = JSON.parse(data);
            console.log(`📚 Base de données chargée depuis ${this.dbFile}: ${Object.keys(this.books).length} livres`);
            
            // Afficher quelques titres pour confirmation
            const titles = Object.values(this.books).slice(0, 3).map(book => book.title).filter(Boolean);
            if (titles.length > 0) {
                console.log(`📖 Exemples de livres: ${titles.join(', ')}...`);
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📝 Création d'une nouvelle base de données: ${this.dbFile}`);
                this.books = {};
                await this.saveDatabase();
            } else {
                console.error('❌ Erreur lors du chargement de la base:', error);
            }
        }
    }

    /**
     * Sauvegarder la base de données
     */
    async saveDatabase() {
        try {
            // Créer une sauvegarde horodatée de temps en temps
            const now = new Date();
            if (now.getMinutes() % 30 === 0) { // Backup toutes les 30 minutes
                const backupFile = this.dbFile.replace('.json', `-backup-${now.toISOString().slice(0, 16).replace(/:/g, '-')}.json`);
                try {
                    await fs.copyFile(this.dbFile, backupFile);
                    console.log(`💾 Sauvegarde créée: ${path.basename(backupFile)}`);
                } catch (e) {
                    // Ignorer les erreurs de backup
                }
            }
            
            // Formater le JSON pour qu'il soit lisible
            const formattedData = JSON.stringify(this.books, null, 2);
            await fs.writeFile(this.dbFile, formattedData, 'utf8');
            
            console.log(`💽 Base de données sauvegardée: ${Object.keys(this.books).length} livres dans ${path.basename(this.dbFile)}`);
        } catch (error) {
            console.error('❌ Erreur lors de la sauvegarde:', error);
            throw error;
        }
    }

    /**
     * Nettoyer l'ISBN
     */
    cleanISBN(isbn) {
        return isbn.replace(/[-\s]/g, '');
    }

    /**
     * Normaliser un ISBN en ISBN-13
     */
    normalizeISBN(isbn) {
        const clean = this.cleanISBN(isbn);
        
        // 🔥 EXCEPTION SPÉCIALE POUR L'EASTER EGG DIABOLIQUE 🔥
        if (clean === '6666666666666') {
            console.log('👹 Pas de normalisation pour l\'ISBN diabolique côté serveur ! 666 !');
            return clean; // Garder tel quel pour préserver l'easter egg
        }
        
        if (clean.length === 13) {
            return clean; // Déjà en ISBN-13
        } else if (clean.length === 10) {
            // Convertir ISBN-10 en ISBN-13
            const prefix = '978';
            const partial = prefix + clean.substring(0, 9);
            
            // Calculer la checksum ISBN-13
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                sum += parseInt(partial[i]) * (i % 2 === 0 ? 1 : 3);
            }
            const checkDigit = (10 - (sum % 10)) % 10;
            
            const isbn13 = partial + checkDigit;
            console.log(`🔄 Conversion serveur ISBN-10 → ISBN-13: ${clean} → ${isbn13}`);
            return isbn13;
        }
        
        return clean; // Retourner tel quel si impossible à convertir
    }

    /**
     * Obtenir les variantes d'un ISBN
     */
    getISBNVariants(isbn) {
        const clean = this.cleanISBN(isbn);
        const variants = [clean];
        
        // Si c'est un ISBN-13, ajouter l'ISBN-10 équivalent
        if (clean.length === 13 && clean.startsWith('978')) {
            const isbn10 = clean.substring(3, 12);
            variants.push(isbn10);
        }
        
        // Si c'est un ISBN-10, ajouter l'ISBN-13 équivalent
        if (clean.length === 10) {
            const isbn13 = this.normalizeISBN(clean);
            if (isbn13 !== clean) variants.push(isbn13);
        }
        
        return variants;
    }

    /**
     * Trouver un livre par toutes ses variantes ISBN
     */
    findBookByISBN(isbn) {
        const variants = this.getISBNVariants(isbn);
        
        for (const variant of variants) {
            if (this.books[variant]) {
                return { book: this.books[variant], foundISBN: variant };
            }
        }
        
        return null;
    }
    validateISBN(isbn) {
        const clean = this.cleanISBN(isbn);
        
        if (clean.length !== 10 && clean.length !== 13) {
            return { valid: false, error: 'L\'ISBN doit contenir 10 ou 13 chiffres' };
        }
        
        if (clean.length === 13) {
            if (!clean.startsWith('978') && !clean.startsWith('979')) {
                return { valid: false, error: 'ISBN-13 doit commencer par 978 ou 979' };
            }
        }
        
        return { valid: true, isbn: clean };
    }

    /**
     * Health check
     */
    async healthCheck(req, res) {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            booksCount: Object.keys(this.books).length
        });
    }

    /**
     * Obtenir un livre par ISBN
     */
    async getBook(req, res) {
        try {
            const { isbn } = req.params;
            const validation = this.validateISBN(isbn);
            
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            const result = this.findBookByISBN(validation.isbn);
            if (!result) {
                return res.status(404).json({ error: 'Livre non trouvé' });
            }

            res.json({
                success: true,
                data: result.book,
                source: 'database',
                foundWithISBN: result.foundISBN
            });
        } catch (error) {
            console.error('❌ Erreur getBook:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Créer un nouveau livre
     */
    async createBook(req, res) {
        try {
            const { isbn, ...bookData } = req.body;
            
            if (!isbn) {
                return res.status(400).json({ error: 'ISBN requis' });
            }

            const validation = this.validateISBN(isbn);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            // Normaliser l'ISBN pour le stockage
            const normalizedISBN = this.normalizeISBN(validation.isbn);

            // Vérifier si le livre existe déjà (toutes variantes)
            const existing = this.findBookByISBN(validation.isbn);
            if (existing) {
                return res.status(409).json({ 
                    error: `Ce livre existe déjà sous l'ISBN ${existing.foundISBN}` 
                });
            }

            // Créer le livre avec l'ISBN normalisé
            const newBook = {
                ...bookData,
                isbn: normalizedISBN,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                source: 'user_created'
            };

            this.books[normalizedISBN] = newBook;
            await this.saveDatabase();

            console.log(`📚 Nouveau livre créé: ${newBook.title || 'Sans titre'} (${normalizedISBN})`);

            res.status(201).json({
                success: true,
                data: newBook,
                message: 'Livre créé avec succès'
            });
        } catch (error) {
            console.error('❌ Erreur createBook:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Mettre à jour un livre
     */
    async updateBook(req, res) {
        try {
            const { isbn } = req.params;
            const updates = req.body;

            const validation = this.validateISBN(isbn);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            if (!this.books[validation.isbn]) {
                return res.status(404).json({ error: 'Livre non trouvé' });
            }

            // Mettre à jour le livre
            this.books[validation.isbn] = {
                ...this.books[validation.isbn],
                ...updates,
                isbn: validation.isbn, // Garder l'ISBN original
                updatedAt: new Date().toISOString()
            };

            await this.saveDatabase();

            res.json({
                success: true,
                data: this.books[validation.isbn],
                message: 'Livre mis à jour avec succès'
            });
        } catch (error) {
            console.error('❌ Erreur updateBook:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Supprimer un livre
     */
    async deleteBook(req, res) {
        try {
            const { isbn } = req.params;
            const validation = this.validateISBN(isbn);
            
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            if (!this.books[validation.isbn]) {
                return res.status(404).json({ error: 'Livre non trouvé' });
            }

            delete this.books[validation.isbn];
            await this.saveDatabase();

            res.json({
                success: true,
                message: 'Livre supprimé avec succès'
            });
        } catch (error) {
            console.error('❌ Erreur deleteBook:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Rechercher des livres
     */
    async searchBooks(req, res) {
        try {
            const { q, limit = 20, offset = 0 } = req.query;
            
            let results = Object.values(this.books);

            // Filtrer par recherche textuelle si fournie
            if (q) {
                const searchTerm = q.toLowerCase();
                results = results.filter(book => {
                    const title = (book.title || '').toLowerCase();
                    const authors = (book.authors || []).join(' ').toLowerCase();
                    const publisher = (book.publisher || '').toLowerCase();
                    
                    return title.includes(searchTerm) || 
                           authors.includes(searchTerm) || 
                           publisher.includes(searchTerm);
                });
            }

            // Pagination
            const total = results.length;
            const paginatedResults = results.slice(offset, offset + parseInt(limit));

            res.json({
                success: true,
                data: paginatedResults,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: (offset + parseInt(limit)) < total
                }
            });
        } catch (error) {
            console.error('❌ Erreur searchBooks:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Obtenir les statistiques
     */
    async getStats(req, res) {
        try {
            const books = Object.values(this.books);
            
            // Calculer les statistiques
            const stats = {
                totalBooks: books.length,
                sources: books.reduce((acc, book) => {
                    acc[book.source] = (acc[book.source] || 0) + 1;
                    return acc;
                }, {}),
                languages: books.reduce((acc, book) => {
                    const lang = book.language || 'unknown';
                    acc[lang] = (acc[lang] || 0) + 1;
                    return acc;
                }, {}),
                categories: books.reduce((acc, book) => {
                    if (book.categories) {
                        book.categories.forEach(cat => {
                            acc[cat] = (acc[cat] || 0) + 1;
                        });
                    }
                    return acc;
                }, {}),
                lastUpdated: books.length > 0 ? 
                    Math.max(...books.map(b => new Date(b.updatedAt || b.createdAt).getTime())) : 
                    null
            };

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('❌ Erreur getStats:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Upload de couverture
     */
    async uploadCover(req, res) {
        try {
            const { isbn } = req.params;
            const { coverData } = req.body;

            const validation = this.validateISBN(isbn);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            if (!this.books[validation.isbn]) {
                return res.status(404).json({ error: 'Livre non trouvé' });
            }

            if (!coverData) {
                return res.status(400).json({ error: 'Données de couverture requises' });
            }

            // Mettre à jour la couverture
            this.books[validation.isbn].imageLinks = {
                ...(this.books[validation.isbn].imageLinks || {}),
                thumbnail: coverData
            };
            this.books[validation.isbn].updatedAt = new Date().toISOString();

            await this.saveDatabase();

            res.json({
                success: true,
                message: 'Couverture mise à jour avec succès'
            });
        } catch (error) {
            console.error('❌ Erreur uploadCover:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

        /**
         * Rechercher via l'API Google Books
         */
        async searchGoogleBooks(req, res) {
            try {
                const { isbn } = req.params;
                const validation = this.validateISBN(isbn);
                
                if (!validation.valid) {
                    return res.status(400).json({ error: validation.error });
                }

                console.log(`📡 Recherche Google Books pour ISBN: ${validation.isbn}`);

                // Vérifier d'abord si le livre existe déjà dans notre base
                const existing = this.findBookByISBN(validation.isbn);
                if (existing) {
                    console.log(`📚 Livre déjà en base sous ISBN ${existing.foundISBN}`);
                    return res.json({
                        success: true,
                        items: [{
                            volumeInfo: existing.book
                        }],
                        source: 'local_database'
                    });
                }

                // Appel à l'API Google Books
                const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${validation.isbn}`;
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Erreur API Google Books: ${response.status}`);
                }
                
                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    // Sauvegarder automatiquement avec l'ISBN normalisé
                    const bookInfo = data.items[0].volumeInfo;
                    const normalizedISBN = this.normalizeISBN(validation.isbn);
                    
                    this.books[normalizedISBN] = {
                        ...bookInfo,
                        isbn: normalizedISBN,
                        source: 'google_api',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    await this.saveDatabase();

                    console.log(`✅ Livre trouvé et sauvegardé: ${bookInfo.title} (${normalizedISBN})`);

                    res.json({
                        success: true,
                        items: data.items,
                        source: 'google_api_server'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Livre non trouvé dans l\'API Google Books'
                    });
                }
            } catch (error) {
                console.error('❌ Erreur searchGoogleBooks:', error);
                res.status(500).json({ 
                    error: 'Erreur lors de la recherche Google Books',
                    details: error.message 
                });
            }
        }

    /**
     * Importer des données depuis localStorage
     */
    async importFromLocalStorage(req, res) {
        try {
            const { books } = req.body;

            if (!books || typeof books !== 'object') {
                return res.status(400).json({ error: 'Données de livres invalides' });
            }

            let importedCount = 0;
            let updatedCount = 0;

            for (const [isbn, bookData] of Object.entries(books)) {
                const validation = this.validateISBN(isbn);
                if (!validation.valid) {
                    console.log(`⚠️ ISBN invalide ignoré: ${isbn}`);
                    continue;
                }

                const normalizedISBN = this.normalizeISBN(validation.isbn);
                
                if (this.books[normalizedISBN]) {
                    // Mettre à jour si le livre existe déjà
                    this.books[normalizedISBN] = {
                        ...this.books[normalizedISBN],
                        ...bookData,
                        updatedAt: new Date().toISOString()
                    };
                    updatedCount++;
                } else {
                    // Ajouter le nouveau livre
                    this.books[normalizedISBN] = {
                        ...bookData,
                        isbn: normalizedISBN,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    importedCount++;
                }
            }

            await this.saveDatabase();

            res.json({
                success: true,
                message: `Synchronisation réussie`,
                imported: importedCount,
                updated: updatedCount,
                total: Object.keys(this.books).length
            });
        } catch (error) {
            console.error('❌ Erreur importFromLocalStorage:', error);
            res.status(500).json({ error: 'Erreur lors de l\'import' });
        }
    }

    /**
     * Exporter les données vers localStorage
     */
    async exportToLocalStorage(req, res) {
        try {
            res.json({
                success: true,
                books: this.books,
                total: Object.keys(this.books).length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('❌ Erreur exportToLocalStorage:', error);
            res.status(500).json({ error: 'Erreur lors de l\'export' });
        }
    }

    errorHandler(error, req, res, next) {
        console.error('❌ Erreur non gérée:', error);
        
        res.status(500).json({
            error: 'Erreur interne du serveur',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    /**
     * Démarrer le serveur
     */
    async start() {
        try {
            await this.loadDatabase();
            
            this.app.listen(this.port, () => {
                console.log(`🚀 Serveur ISBN Search démarré sur le port ${this.port}`);
                console.log(`📚 Base de données: ${Object.keys(this.books).length} livres`);
                console.log(`🌐 URL: http://localhost:${this.port}`);
                console.log(`📊 API: http://localhost:${this.port}/api/health`);
            });
        } catch (error) {
            console.error('❌ Erreur lors du démarrage du serveur:', error);
            process.exit(1);
        }
    }

    /**
     * Arrêter proprement le serveur
     */
    async stop() {
        try {
            await this.saveDatabase();
            console.log('💾 Base de données sauvegardée');
            process.exit(0);
        } catch (error) {
            console.error('❌ Erreur lors de l\'arrêt:', error);
            process.exit(1);
        }
    }
}

// Démarrer le serveur si ce fichier est exécuté directement
if (require.main === module) {
    const server = new ISBNServer();
    
    // Gestionnaires pour arrêt propre
    process.on('SIGINT', () => {
        console.log('\n🛑 Arrêt du serveur...');
        server.stop();
    });
    process.on('SIGTERM', () => {
        console.log('\n🛑 Arrêt du serveur...');
        server.stop();
    });
    
    server.start();
}

module.exports = ISBNServer;