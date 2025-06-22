require('dotenv').config({ path: '.env.local' });

/**
 * Serveur backend pour ISBN Search
 * Version simplifiée et corrigée
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fetch = require('node-fetch');
const { db } = require('@vercel/postgres');
const fs = require('fs').promises; // Gardé uniquement pour la migration initiale

/**
 * Met en place la base de données.
 * Crée la table si elle n'existe pas et migre les données depuis le JSON.
 */
async function setupDatabase() {
    console.log('🔧 Initialisation de la base de données...');
    try {
        // Créer la table si elle n'existe pas
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS books (
                isbn TEXT PRIMARY KEY,
                data JSONB NOT NULL
            );
        `;
        await db.query(createTableQuery);
        console.log('✅ Table "books" vérifiée/créée.');

        // Migrer les données depuis le fichier JSON
        const dbFile = path.join(__dirname, 'data', 'books.json');
        let booksJson = {};
        try {
            const data = await fs.readFile(dbFile, 'utf8');
            booksJson = JSON.parse(data);
        } catch (error) {
            console.warn(`⚠️ Fichier books.json non trouvé ou invalide, migration ignorée.`, error.message);
            return;
        }

        const booksToMigrate = Object.entries(booksJson);
        if (booksToMigrate.length === 0) {
            console.log('➡️ Aucune donnée à migrer depuis le JSON.');
            return;
        }

        console.log(`⏳ Migration de ${booksToMigrate.length} livres depuis books.json...`);
        
        const client = await db.connect();
        try {
            for (const [isbn, bookData] of booksToMigrate) {
                 // On utilise ON CONFLICT pour ne pas écraser les données existantes
                const insertQuery = `
                    INSERT INTO books (isbn, data) VALUES ($1, $2)
                    ON CONFLICT (isbn) DO NOTHING;
                `;
                await client.query(insertQuery, [isbn, JSON.stringify(bookData)]);
            }
        } finally {
            client.release();
        }

        console.log('🎉 Migration terminée avec succès.');

    } catch (error) {
        console.error('❌ Erreur critique lors de la mise en place de la base de données :', error);
        // On ne quitte pas le processus pour permettre au serveur de démarrer malgré tout
    }
}

class ISBNServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
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
    async findBookByISBN(isbn) {
        const variants = this.getISBNVariants(isbn);
        
        const query = `SELECT data FROM books WHERE isbn = ANY($1)`;
        const { rows } = await db.query(query, [variants]);

        if (rows.length > 0) {
            // On retourne le livre trouvé et l'ISBN qui a correspondu
            const foundData = rows[0].data;
            return { book: foundData, foundISBN: foundData.isbn };
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
        try {
            const result = await db.query('SELECT COUNT(*) as count FROM books');
            const booksCount = result.rows[0].count;
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                database: 'connected',
                booksCount: parseInt(booksCount, 10)
            });
        } catch(e) {
             res.status(500).json({
                status: 'ERROR',
                database: 'disconnected',
                error: e.message
             });
        }
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

            const result = await this.findBookByISBN(validation.isbn);

            if (result && result.book) {
                res.json(result.book);
            } else {
                res.status(404).json({ error: `Livre avec l'ISBN ${isbn} non trouvé` });
            }
        } catch (error) {
            console.error('❌ Erreur getBook:', error);
            res.status(500).json({ error: 'Erreur interne du serveur' });
        }
    }

    /**
     * Créer un nouveau livre
     */
    async createBook(req, res) {
        try {
            const bookData = req.body;
            if (!bookData || !bookData.isbn) {
                return res.status(400).json({ error: 'Données du livre ou ISBN manquant' });
            }

            const validation = this.validateISBN(bookData.isbn);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
            const normalizedISBN = this.normalizeISBN(validation.isbn);
            
            const finalBookData = {
                ...bookData,
                isbn: normalizedISBN,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const query = `
                INSERT INTO books (isbn, data) VALUES ($1, $2)
                ON CONFLICT (isbn) DO UPDATE SET data = EXCLUDED.data
                RETURNING data;
            `;

            const { rows } = await db.query(query, [normalizedISBN, JSON.stringify(finalBookData)]);
            
            res.status(201).json(rows[0].data);

        } catch (error) {
            console.error('❌ Erreur createBook:', error);
            res.status(500).json({ error: 'Erreur lors de la création du livre' });
        }
    }

    /**
     * Mettre à jour un livre
     */
    async updateBook(req, res) {
        try {
            const { isbn } = req.params;
            const bookData = req.body;

            const validation = this.validateISBN(isbn);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
            const normalizedISBN = this.normalizeISBN(validation.isbn);

            // 1. Récupérer les données existantes
            const existingQuery = 'SELECT data FROM books WHERE isbn = $1';
            const { rows: existingRows } = await db.query(existingQuery, [normalizedISBN]);

            if (existingRows.length === 0) {
                return res.status(404).json({ error: `Livre avec l'ISBN ${isbn} non trouvé` });
            }

            // 2. Fusionner les données
            const updatedData = {
                ...existingRows[0].data,
                ...bookData,
                updatedAt: new Date().toISOString()
            };

            // 3. Mettre à jour dans la base
            const updateQuery = 'UPDATE books SET data = $1 WHERE isbn = $2 RETURNING data;';
            const { rows } = await db.query(updateQuery, [JSON.stringify(updatedData), normalizedISBN]);

            res.json(rows[0].data);

        } catch (error) {
            console.error('❌ Erreur updateBook:', error);
            res.status(500).json({ error: 'Erreur lors de la mise à jour du livre' });
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
            const normalizedISBN = this.normalizeISBN(validation.isbn);

            const query = 'DELETE FROM books WHERE isbn = $1 RETURNING isbn;';
            const { rowCount } = await db.query(query, [normalizedISBN]);

            if (rowCount > 0) {
                res.status(204).send(); // No content
            } else {
                res.status(404).json({ error: `Livre avec l'ISBN ${isbn} non trouvé` });
            }
        } catch (error) {
            console.error('❌ Erreur deleteBook:', error);
            res.status(500).json({ error: 'Erreur lors de la suppression du livre' });
        }
    }

    /**
     * Rechercher des livres (par titre, auteur, etc.)
     */
    async searchBooks(req, res) {
        try {
            const { q, limit = 10, offset = 0 } = req.query;
            if (!q) {
                // Si pas de query, retourner les derniers livres ajoutés
                const query = 'SELECT data FROM books ORDER BY (data->>\'createdAt\') DESC LIMIT $1 OFFSET $2';
                const { rows } = await db.query(query, [limit, offset]);
                return res.json(rows.map(r => r.data));
            }

            const searchTerm = `%${q}%`;
            const query = `
                SELECT data FROM books
                WHERE 
                    data->>'title' ILIKE $1 OR
                    data->>'authors' ILIKE $1 OR
                    data->>'publisher' ILIKE $1 OR
                    data->>'description' ILIKE $1
                ORDER BY (data->>'createdAt') DESC
                LIMIT $2 OFFSET $3;
            `;
            const { rows } = await db.query(query, [searchTerm, limit, offset]);

            res.json(rows.map(r => r.data));

        } catch (error) {
            console.error('❌ Erreur searchBooks:', error);
            res.status(500).json({ error: 'Erreur lors de la recherche de livres' });
        }
    }

    /**
     * Obtenir des statistiques sur la base de données
     */
    async getStats(req, res) {
        try {
            const { rows } = await db.query('SELECT COUNT(*) as total FROM books');
            const total = parseInt(rows[0].total, 10);
            
            // On pourrait ajouter d'autres stats ici (derniers ajouts, etc.)
            res.json({
                totalBooks: total,
                // On peut mettre une date statique pour la source initiale
                initialDataSource: 'data/books.json', 
            });

        } catch (error) {
            console.error('❌ Erreur getStats:', error);
            res.status(500).json({ error: 'Erreur interne du serveur' });
        }
    }

    /**
     * Upload de couverture
     */
    async uploadCover(req, res) {
        // Pour l'instant, on se contente de retourner une erreur 501 Not Implemented
        // car la logique de stockage de fichiers n'est pas implémentée.
        // La solution serait d'utiliser Vercel Blob Storage ici.
        return res.status(501).json({ 
            error: 'La fonctionnalité d\'upload de couverture n\'est pas encore implémentée.',
            suggestion: 'Utiliser Vercel Blob Storage.'
        });

        // La logique ci-dessous est obsolète car elle sauve en local
        /*
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
        */
    }

    /**
     * Rechercher via l'API Google Books
     */
    async searchGoogleBooks(req, res) {
        try {
            const { isbn } = req.params;
            const validation = this.validateISBN(isbn);

            if (!validation.valid) {
                return res.status(400).json({ error: validation.error, source: 'validation' });
            }

            console.log(`📡 Recherche Google Books pour ISBN: ${validation.isbn}`);

            // Vérifier d'abord si le livre existe déjà dans notre base
            const existing = await this.findBookByISBN(validation.isbn);
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
                
                const bookToSave = {
                    ...bookInfo,
                    isbn: normalizedISBN,
                    source: 'google_api',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const query = `
                    INSERT INTO books (isbn, data) VALUES ($1, $2)
                    ON CONFLICT (isbn) DO NOTHING;
                `;
                await db.query(query, [normalizedISBN, JSON.stringify(bookToSave)]);

                console.log(`✅ Livre trouvé et sauvegardé via Google API: ${bookInfo.title} (${normalizedISBN})`);

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

            const client = await db.connect();
            try {
                for (const [isbn, bookData] of Object.entries(books)) {
                    const validation = this.validateISBN(isbn);
                    if (!validation.valid) {
                        console.log(`⚠️ ISBN invalide ignoré: ${isbn}`);
                        continue;
                    }

                    const normalizedISBN = this.normalizeISBN(validation.isbn);
                    
                    const finalBookData = {
                        ...bookData,
                        isbn: normalizedISBN,
                        createdAt: bookData.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    const query = `
                        INSERT INTO books (isbn, data) VALUES ($1, $2)
                        ON CONFLICT (isbn) DO UPDATE SET data = jsonb_set(
                            books.data, 
                            '{updatedAt}', 
                            to_jsonb($3::text),
                            true
                         ) WHERE (books.data->>'updatedAt')::timestamptz < $3::timestamptz
                        RETURNING xmax;
                    `;
                    // xmax=0 si INSERT, >0 si UPDATE
                    const { rows } = await client.query(query, [normalizedISBN, JSON.stringify(finalBookData), finalBookData.updatedAt]);
                    
                    if (rows.length > 0) {
                        if (rows[0].xmax === 0) {
                            importedCount++;
                        } else {
                            updatedCount++;
                        }
                    }
                }
            } finally {
                client.release();
            }

            const { rows: totalRows } = await db.query('SELECT COUNT(*) as total FROM books');

            res.json({
                success: true,
                message: `Synchronisation réussie`,
                imported: importedCount,
                updated: updatedCount,
                total: parseInt(totalRows[0].total, 10)
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
            const { rows } = await db.query('SELECT isbn, data FROM books');
            const books = rows.reduce((acc, row) => {
                acc[row.isbn] = row.data;
                return acc;
            }, {});

            res.json({
                success: true,
                books: books,
                total: rows.length,
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
            // La mise en place de la DB est maintenant gérée de manière globale
            
            this.app.listen(this.port, () => {
                console.log(`🚀 Serveur ISBN Search démarré sur le port ${this.port}`);
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
            // Il n'y a plus de sauvegarde de fichier à faire
            console.log('✅ Serveur arrêté proprement');
            process.exit(0);
        } catch (error) {
            console.error('❌ Erreur lors de l\'arrêt:', error);
            process.exit(1);
        }
    }
}

const server = new ISBNServer();

// On crée une promesse unique pour l'initialisation.
// Le serveur ne démarrera pas si la base de données n'est pas accessible.
const initPromise = setupDatabase().then(() => {
    console.log('✅ Base de données prête.');
    return server; // On retourne l'instance du serveur une fois prête.
}).catch(err => {
    console.error("‼️ ERREUR CRITIQUE: L'INITIALISATION DE LA DB A ÉCHOUÉ ‼️", err);
    process.exit(1); // Arrête le processus si la DB ne peut être contactée.
});

// Pour Vercel (`vercel deploy` et `vercel dev`)
// On exporte une fonction `async` que Vercel peut exécuter.
module.exports = async (req, res) => {
    try {
        // On attend que la promesse d'initialisation soit résolue
        const initializedServer = await initPromise;
        // On passe la requête à l'application Express une fois prête
        return initializedServer.app(req, res);
    } catch (error) {
        console.error("Erreur lors de l'attente de l'initialisation", error);
        res.status(500).send("Erreur interne du serveur lors de l'initialisation.");
    }
};

// Pour le développement local traditionnel avec `node server.js`
if (require.main === module) {
    initPromise.then(s => {
        // On appelle `start()` sur l'instance de serveur résolue
        s.start();

        process.on('SIGINT', () => {
            console.log('\n🛑 Arrêt du serveur...');
            s.stop();
        });
        process.on('SIGTERM', () => {
            console.log('\n🛑 Arrêt du serveur...');
            s.stop();
        });
    });
}