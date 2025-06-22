/**
 * Gestionnaire de l'interface utilisateur
 * Gère l'affichage, les animations et les interactions
 */
class UIManager {
    constructor() {
        this.currentBook = null;
        this.isDemonMode = false;
        this.plantInterval = null;
        this.initializeAnimations();
    }

    /**
     * Initialiser les animations de fond
     */
    initializeAnimations() {
        this.startPlantAnimation();
        
        // Créer quelques éléments au début
        for (let i = 0; i < 5; i++) {
            setTimeout(() => this.createFallingElement(), i * 200);
        }
    }

    /**
     * Démarrer l'animation des éléments qui tombent
     */
    startPlantAnimation() {
        if (this.plantInterval) {
            clearInterval(this.plantInterval);
        }
        
        const interval = this.isDemonMode ? 500 : 1000;
        this.plantInterval = setInterval(() => this.createFallingElement(), interval);
    }

    /**
     * Créer un élément qui tombe (plante ou démon)
     */
    createFallingElement() {
        const element = document.createElement('div');
        element.className = 'daisy';
        
        const plantEmojis = [
            '🌼', '🌸', '🌺', '🌻', '🌷', '🌹', '🌿', '🍀', 
            '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '🍃',
            '🌺', '🌻', '🌼', '🌸', '🌷', '🌹', '🥀', '🌪️'
        ];
        const demonEmojis = ['👹', '😈', '👺', '🔥'];
        
        const emojiArray = this.isDemonMode ? demonEmojis : plantEmojis;
        const randomEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];
        element.innerHTML = randomEmoji;
        
        element.style.left = Math.random() * 100 + 'vw';
        
        const duration = Math.random() * 6 + 6;
        element.style.animationDuration = duration + 's';
        element.style.animationDelay = Math.random() * 1 + 's';
        
        const size = Math.random() * 12 + 16;
        element.style.fontSize = size + 'px';
        
        document.body.appendChild(element);
        
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }, (duration + 1) * 1000);
    }

    /**
     * Activer le mode démon
     */
    activateDemonMode() {
        this.isDemonMode = true;
        this.startPlantAnimation();
        
        // Changer le fond temporairement
        document.body.style.background = 'linear-gradient(135deg, #660000 0%, #330000 100%)';
        setTimeout(() => {
            document.body.style.background = '';
        }, 3000);
    }

    /**
     * Désactiver le mode démon
     */
    deactivateDemonMode() {
        this.isDemonMode = false;
        this.startPlantAnimation();
        document.body.style.background = '';
    }

    /**
     * Afficher l'état de chargement
     */
    showLoading(show = true) {
        const loadingDiv = document.getElementById('loading');
        const button = document.querySelector('.search-btn');
        const btnText = document.getElementById('btnText');
        
        if (show) {
            loadingDiv.style.display = 'block';
            button.disabled = true;
            btnText.textContent = 'Recherche...';
        } else {
            loadingDiv.style.display = 'none';
            button.disabled = false;
            btnText.textContent = 'Rechercher';
        }
    }

    /**
     * Afficher un message d'erreur
     */
    showError(message) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `<div class="error">${message}</div>`;
    }

    /**
     * Afficher un message de succès
     */
    showSuccess(message) {
        const resultsDiv = document.getElementById('results');
        const existingContent = resultsDiv.innerHTML;
        resultsDiv.innerHTML = `<div class="success">${message}</div>` + existingContent;
    }

    /**
     * Afficher les informations d'un livre
     */
    displayBook(book) {
        this.currentBook = book;
        const info = book.volumeInfo;
        const resultsDiv = document.getElementById('results');

        const categories = info.categories && info.categories.length > 0 
            ? info.categories 
            : ['Inconnue'];

        const isUnknown = categories.length === 1 && categories[0].toLowerCase() === 'inconnue';
        const isFieldUnknown = (value) => !value || value === 'Inconnu' || value === 'Inconnue';

        const fields = {
            title: {
                value: info.title || 'Titre inconnu',
                unknown: isFieldUnknown(info.title) || book.isNotFound,
                example: 'Ex: Le Rouge et le Noir',
                addLabel: 'Ajouter le titre'
            },
            authors: {
                value: info.authors ? info.authors.join(', ') : 'Inconnu',
                unknown: isFieldUnknown(info.authors ? info.authors.join(', ') : null) || book.isNotFound,
                example: 'Ex: Victor Hugo, J.K. Rowling, Stephen King...',
                addLabel: 'Ajouter un auteur'
            },
            publisher: {
                value: info.publisher || 'Inconnu',
                unknown: isFieldUnknown(info.publisher) || book.isNotFound,
                example: 'Ex: Gallimard, Flammarion, Le Livre de Poche...',
                addLabel: 'Ajouter un éditeur'
            },
            publishedDate: {
                value: info.publishedDate || 'Inconnue',
                unknown: isFieldUnknown(info.publishedDate) || book.isNotFound,
                example: 'Ex: 2023, 15/03/2022, Mars 2021...',
                addLabel: 'Ajouter la date'
            },
            pageCount: {
                value: info.pageCount || 'Inconnu',
                unknown: isFieldUnknown(info.pageCount) || book.isNotFound,
                example: 'Ex: 250, 432, 156...',
                addLabel: 'Ajouter le nbr de pages'
            }
        };

        const bookHtml = this.generateBookHTML(book, info, fields, categories, isUnknown);
        resultsDiv.innerHTML = bookHtml;

        if (book.isNotFound) {
            const isbn = book.volumeInfo.industryIdentifiers[0].identifier;
            const bookCard = resultsDiv.querySelector('.book-card');
            if (bookCard) {
                const actionsHtml = `
                    <div class="contribute-actions">
                        <button class="contribute-btn" onclick="ui.showBookForm('${isbn}')">
                            <span class="icon">➕</span> Ajouter le livre
                        </button>
                        <button class="cancel-btn" onclick="ui.searchAgain()">
                            <span class="icon">🔍</span> Nouvelle recherche
                        </button>
                    </div>
                `;
                bookCard.insertAdjacentHTML('afterend', actionsHtml);
            }
        }
    }

    /**
     * Générer le HTML pour l'affichage d'un livre
     */
    generateBookHTML(book, info, fields, categories, isUnknown) {
        const notFoundClass = book.isNotFound ? 'not-found-title' : '';
        const bookCardClass = book.isNotFound ? 'book-card-not-found' : '';

        // Séparer le titre des autres champs
        const { title, ...otherFields } = fields;

        return `
            <div class="book-card ${bookCardClass}">
                <div class="book-content">
                    <div class="book-cover">
                        ${info.imageLinks ? 
                            `<img src="${info.imageLinks.thumbnail || info.imageLinks.smallThumbnail}" alt="Couverture">` 
                            : `<div class="no-cover" onclick="document.getElementById('bookCoverInput').click()">
                                 📚
                                 <div class="no-cover-text">Cliquez pour ajouter<br>une couverture</div>
                               </div>
                               <input type="file" id="bookCoverInput" class="cover-upload-input" accept="image/*" onchange="handleBookCoverUpload(event)">`
                        }
                    </div>
                    <div class="book-details">
                        ${this.generateTitleSection(title)}
                        
                        <div class="book-meta">
                            ${this.generateMetaFields(otherFields)}
                            
                            <div class="meta-item">
                                <div class="meta-label">Langue</div>
                                <div class="meta-value">${this.getLanguageName(info.language || 'unknown')}</div>
                            </div>
                            
                            <div class="meta-item">
                                <div class="meta-label">ISBN</div>
                                <div class="meta-value">${info.industryIdentifiers ? 
                                    info.industryIdentifiers.map(id => `${id.type}: ${id.identifier}`).join('<br>') 
                                    : 'Inconnu'}</div>
                            </div>

                            ${this.generateCategoriesSection(categories, isUnknown)}
                            ${this.generateDescriptionSection(info.description)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Générer la section du titre éditable
     */
    generateTitleSection(titleField) {
        return `
            <div class="book-title-section ${titleField.unknown ? 'unknown' : ''}" data-field="title">
                <div id="titleValue">
                    <h2 class="${titleField.unknown ? 'not-found-title' : ''}">
                        ${titleField.value}
                        <button class="edit-field-btn" onclick="ui.toggleEditField('title')">${titleField.unknown ? titleField.addLabel : 'Modifier'}</button>
                    </h2>
                </div>
                <div class="field-edit" id="titleEdit" style="display: none;">
                    <input type="text" class="field-input title-input" id="titleInput" value="${titleField.value !== 'Titre inconnu' && titleField.value !== 'Livre non trouvé !' ? titleField.value : ''}" placeholder="${titleField.example}">
                    <button class="field-save-btn" onclick="ui.saveField('title')">Sauver</button>
                    <button class="field-cancel-btn" onclick="ui.cancelEditField('title')">Annuler</button>
                </div>
            </div>
        `;
    }

    /**
     * Générer les champs de métadonnées
     */
    generateMetaFields(fields) {
        return Object.entries(fields).map(([fieldName, field]) => `
            <div class="meta-item ${field.unknown ? 'unknown' : ''}" data-field="${fieldName}">
                <div class="meta-label">
                    ${this.getFieldLabel(fieldName)}
                    <button class="edit-field-btn" onclick="ui.toggleEditField('${fieldName}')">${field.unknown ? field.addLabel : 'Modifier'}</button>
                </div>
                <div class="meta-value ${field.unknown ? 'unknown' : ''}" id="${fieldName}Value">${field.value}</div>
                ${field.unknown ? `<div class="unknown-field-message">${field.example}</div>` : ''}
                <div class="field-edit" id="${fieldName}Edit" style="display: none;">
                    <input type="text" class="field-input" id="${fieldName}Input" value="${field.value !== 'Inconnu' && field.value !== 'Inconnue' ? field.value : ''}" placeholder="${field.example}">
                    <button class="field-save-btn" onclick="ui.saveField('${fieldName}')">Sauver</button>
                    <button class="field-cancel-btn" onclick="ui.cancelEditField('${fieldName}')">Annuler</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Générer la section des catégories
     */
    generateCategoriesSection(categories, isUnknown) {
        return `
            <div class="meta-item ${isUnknown ? 'unknown' : ''}" data-field="categories">
                <div class="meta-label">
                    Catégories
                    <button class="edit-btn" onclick="ui.toggleEditCategories()">${isUnknown ? 'Ajouter des catégories' : 'Modifier'}</button>
                </div>
                
                <div class="categories-display" id="categoriesDisplay">
                    ${categories.map(cat => `<span class="category-tag ${isUnknown ? 'unknown' : ''}">${cat}</span>`).join('')}
                </div>
                
                ${isUnknown ? `
                    <div class="unknown-field-message">
                        <strong>Catégorie manquante !</strong> Aidez-nous en ajoutant une catégorie pour ce livre.<br>
                        <em>Exemples : Fiction, Science-fiction, Historique, Romance, Biographie, Essai, Poésie, Thriller, Fantastique...</em>
                    </div>
                ` : ''}
                
                <div class="categories-edit" id="categoriesEdit" style="display: none;">
                    <input type="text" class="categories-input" id="categoriesInput" 
                           value="${categories.join(', ')}" 
                           placeholder="Séparez par des virgules">
                    <button class="field-save-btn" onclick="ui.saveCategories()">Sauvegarder</button>
                    <button class="field-cancel-btn" onclick="ui.cancelEditCategories()">Annuler</button>
                </div>
            </div>
        `;
    }

    /**
     * Générer la section description
     */
    generateDescriptionSection(description) {
        const hasDescription = description && description !== 'Aucune description disponible';
        
        return `
            <div class="meta-item ${!hasDescription ? 'unknown' : ''}" data-field="description">
                <div class="meta-label">
                    Description
                    <button class="edit-${hasDescription ? 'btn' : 'field-btn'}" onclick="ui.toggleEditDescription()">${hasDescription ? 'Modifier' : 'Ajouter une description'}</button>
                </div>
                <div class="meta-value ${!hasDescription ? 'unknown' : ''}" id="descriptionText">${description || 'Aucune description disponible'}</div>
                ${!hasDescription ? `
                    <div class="unknown-field-message">
                        <strong>Description manquante !</strong> Aidez-nous en ajoutant une description pour ce livre.<br>
                        <em>Décrivez l'intrigue, les personnages, les thèmes abordés, le style de l'auteur...</em>
                    </div>
                ` : ''}
                <div class="field-edit" id="descriptionEdit" style="display: none;">
                    <textarea class="field-input" id="descriptionInput" placeholder="Décrivez le livre, son intrigue, ses thèmes, les personnages principaux..." style="min-height: 100px; resize: vertical;">${description || ''}</textarea>
                    <button class="field-save-btn" onclick="ui.saveDescription()">Sauvegarder</button>
                    <button class="field-cancel-btn" onclick="ui.cancelEditDescription()">Annuler</button>
                </div>
            </div>
        `;
    }

    /**
     * Obtenir le label d'un champ
     */
    getFieldLabel(fieldName) {
        const labels = {
            title: 'Titre',
            authors: 'Auteur(s)',
            publisher: 'Éditeur',
            publishedDate: 'Date de publication',
            pageCount: 'Nombre de pages'
        };
        return labels[fieldName] || fieldName;
    }

    /**
     * Obtenir le nom de la langue
     */
    getLanguageName(code) {
        const languages = {
            'fr': 'Français',
            'en': 'Anglais',
            'de': 'Allemand',
            'es': 'Espagnol',
            'it': 'Italien',
            'nl': 'Néerlandais',
            'pt': 'Portugais',
            'ru': 'Russe',
            'ja': 'Japonais',
            'zh': 'Chinois',
            'ar': 'Arabe',
            'la': 'Latin',
            'unknown': 'Inconnue',
            'demon': '👹 Démoniaque 👹'
        };
        const name = languages[code] || code;
        return name;
    }

    /**
     * Affiche une invite lorsque le livre n'est pas trouvé
     */
    showNotFoundPrompt(isbn) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <div class="contribute-section">
                <div class="contribute-title">📚 Livre non trouvé</div>
                <div class="contribute-subtitle">
                    Le livre avec l'ISBN <strong>${isbn}</strong> n'a pas été trouvé dans notre base de données.
                </div>
                <div class="contribute-actions">
                    <button class="contribute-btn" onclick="ui.displayBookNotFound('${isbn}')">
                        <span class="icon">➕</span> Compléter les informations
                    </button>
                    <button class="cancel-btn" onclick="ui.searchAgain()">
                        <span class="icon">🔍</span> Nouvelle recherche
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Afficher le livre non trouvé en utilisant le template de livre
     */
    displayBookNotFound(isbn) {
        const book = {
            isNotFound: true,
            volumeInfo: {
                title: 'Livre non trouvé !',
                authors: null,
                publisher: null,
                publishedDate: null,
                pageCount: null,
                categories: null,
                language: 'unknown',
                description: `Aucun livre avec l'ISBN <strong>${isbn}</strong> n'a été trouvé. Vous pouvez l'ajouter manuellement à la base de données locale pour le retrouver plus tard.`,
                industryIdentifiers: [{
                    type: 'ISBN',
                    identifier: isbn
                }],
                imageLinks: null
            }
        };
        this.displayBook(book);
    }

    /**
     * Afficher le formulaire pour ajouter un livre
     */
    showBookForm(isbn) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <div class="book-form" id="bookForm">
                <div class="form-title">📖 Créer une nouvelle fiche livre</div>
                
                <div class="form-grid">
                    <div class="cover-upload">
                        <div class="cover-preview" onclick="document.getElementById('coverInput').click()">
                            <div class="cover-placeholder">📚</div>
                            <div class="cover-text">Cliquez pour ajouter<br>une couverture</div>
                        </div>
                        <input type="file" id="coverInput" class="file-input" accept="image/*" onchange="ui.handleCoverUpload(event)">
                        <button class="upload-btn-form" onclick="document.getElementById('coverInput').click()">
                            Choisir une image
                        </button>
                    </div>

                    <div class="form-fields">
                        <div class="form-group">
                            <label class="form-label" for="isbnField">ISBN *</label>
                            <input type="text" id="isbnField" class="form-input" value="${isbn}" readonly>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="titleField">Titre *</label>
                            <input type="text" id="titleField" class="form-input" placeholder="Le titre du livre" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="authorsField">Auteur(s) *</label>
                            <input type="text" id="authorsField" class="form-input" placeholder="Victor Hugo, Pierre Bourdieu..." required>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="publisherField">Éditeur</label>
                            <input type="text" id="publisherField" class="form-input" placeholder="Gallimard, Flammarion...">
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="publishedDateField">Date de publication</label>
                            <input type="text" id="publishedDateField" class="form-input" placeholder="2023, 15/03/2022...">
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="pageCountField">Nombre de pages</label>
                            <input type="number" id="pageCountField" class="form-input" placeholder="250">
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="categoriesField">Catégories</label>
                            <input type="text" id="categoriesField" class="form-input" placeholder="Fiction, Science-fiction, Romance...">
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="languageField">Langue</label>
                            <select id="languageField" class="form-input">
                                <option value="fr">Français</option>
                                <option value="en">Anglais</option>
                                <option value="es">Espagnol</option>
                                <option value="de">Allemand</option>
                                <option value="it">Italien</option>
                                <option value="pt">Portugais</option>
                                <option value="other">Autre</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="descriptionField">Description</label>
                            <textarea id="descriptionField" class="form-textarea" placeholder="Décrivez le livre, son intrigue, ses thèmes, les personnages principaux..."></textarea>
                        </div>
                    </div>
                </div>

                <div class="form-buttons">
                    <button class="submit-btn" onclick="ui.submitBookForm()">Créer la fiche</button>
                    <button class="cancel-form-btn" onclick="ui.cancelBookForm('${isbn}')">Annuler</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            document.getElementById('bookForm').style.display = 'block';
        }, 100);
    }

    /**
     * Gérer l'upload de couverture dans le formulaire
     */
    async handleCoverUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const validation = imageService.validateImageFile(file);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        try {
            const imageData = await imageService.fileToBase64(file);
            const preview = document.querySelector('.cover-preview');
            preview.innerHTML = `<img src="${imageData}" alt="Couverture">`;
            preview.style.border = '2px solid var(--black)';
        } catch (error) {
            console.error('Erreur lors du traitement de l\'image:', error);
            alert('Erreur lors du traitement de l\'image');
        }
    }

    /**
     * Soumettre le formulaire de création de livre
     */
    submitBookForm() {
        const title = document.getElementById('titleField').value.trim();
        const authors = document.getElementById('authorsField').value.trim();
        const isbn = document.getElementById('isbnField').value.trim();

        if (!title || !authors) {
            alert('Veuillez remplir au moins le titre et l\'auteur');
            return;
        }

        const bookData = {
            isbn: isbn,
            title: title,
            authors: authors.split(',').map(a => a.trim()),
            publisher: document.getElementById('publisherField').value.trim() || null,
            publishedDate: document.getElementById('publishedDateField').value.trim() || null,
            pageCount: parseInt(document.getElementById('pageCountField').value) || null,
            categories: document.getElementById('categoriesField').value.trim() 
                ? document.getElementById('categoriesField').value.split(',').map(c => c.trim())
                : ['Inconnue'],
            language: document.getElementById('languageField').value,
            description: document.getElementById('descriptionField').value.trim() || null,
            coverImage: document.querySelector('.cover-preview img')?.src || null
        };

        this.createBookFromForm(bookData);
    }

    /**
     * Créer un livre à partir des données du formulaire
     */
    createBookFromForm(data) {
        const fakeBook = {
            volumeInfo: {
                title: data.title,
                authors: data.authors,
                publisher: data.publisher,
                publishedDate: data.publishedDate,
                pageCount: data.pageCount,
                categories: data.categories,
                language: data.language,
                description: data.description,
                industryIdentifiers: [
                    { type: "ISBN_13", identifier: data.isbn }
                ],
                imageLinks: data.coverImage ? { thumbnail: data.coverImage } : null
            }
        };

        this.currentBook = fakeBook;

        // Sauvegarder dans la base de données
        bookDatabase.addBook(data.isbn, {
            ...fakeBook.volumeInfo,
            source: 'user_created'
        });

        this.showFormSuccess(data.title);
        
        setTimeout(() => {
            this.showSuccess(`Fiche créée avec succès pour "${data.title}"`);
            this.displayBook(fakeBook);
        }, 2000);
    }

    /**
     * Afficher le succès de création de formulaire
     */
    showFormSuccess(title) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `
            <div class="form-success">
                <div class="success-title">✅ Fiche créée avec succès !</div>
                <div class="success-message">
                    Merci pour votre contribution !<br>
                    La fiche pour "<strong>${title}</strong>" a été créée et sera bientôt disponible pour tous les utilisateurs.
                </div>
            </div>
        `;
    }

    /**
     * Annuler l'ajout d'un livre
     */
    cancelBookForm(isbn) {
        this.displayBookNotFound(isbn);
    }

    /**
     * Recommencer une recherche
     */
    searchAgain() {
        document.getElementById('results').innerHTML = '';
        document.getElementById('isbnInput').value = '';
        document.getElementById('isbnInput').focus();
    }

    /**
     * Aller à l'accueil
     */
    goHome() {
        document.getElementById('results').innerHTML = '';
        document.getElementById('isbnInput').value = '978-2-401-08462-9';
        document.getElementById('isbnInput').focus();
        
        if (this.isDemonMode) {
            this.deactivateDemonMode();
        }
        
        this.showLoading(false);
    }

    // Méthodes d'édition des champs

    /**
     * Basculer l'édition d'un champ
     */
    toggleEditField(fieldName) {
        const valueDiv = document.getElementById(fieldName + 'Value');
        const editDiv = document.getElementById(fieldName + 'Edit');
        const input = document.getElementById(fieldName + 'Input');
        
        valueDiv.style.display = 'none';
        editDiv.style.display = 'block';
        input.focus();
    }

    /**
     * Annuler l'édition d'un champ
     */
    cancelEditField(fieldName) {
        const valueDiv = document.getElementById(fieldName + 'Value');
        const editDiv = document.getElementById(fieldName + 'Edit');
        
        valueDiv.style.display = 'block';
        editDiv.style.display = 'none';
    }

    /**
     * Sauvegarder un champ
     */
    saveField(fieldName) {
        const input = document.getElementById(fieldName + 'Input');
        const valueDiv = document.getElementById(fieldName + 'Value');
        const editDiv = document.getElementById(fieldName + 'Edit');
        const metaItem = document.querySelector(`[data-field="${fieldName}"]`);
        
        let newValue = input.value.trim();
        
        if (!newValue) {
            newValue = fieldName === 'publishedDate' ? 'Inconnue' : 'Inconnu';
        }
        
        // Mettre à jour les données du livre
        if (this.currentBook && this.currentBook.volumeInfo) {
            if (fieldName === 'authors') {
                this.currentBook.volumeInfo.authors = newValue !== 'Inconnu' ? newValue.split(',').map(a => a.trim()) : null;
            } else if (fieldName === 'publisher') {
                this.currentBook.volumeInfo.publisher = newValue !== 'Inconnu' ? newValue : null;
            } else if (fieldName === 'publishedDate') {
                this.currentBook.volumeInfo.publishedDate = newValue !== 'Inconnue' ? newValue : null;
            } else if (fieldName === 'pageCount') {
                this.currentBook.volumeInfo.pageCount = newValue !== 'Inconnu' ? parseInt(newValue) || null : null;
            } else if (fieldName === 'title') {
                this.currentBook.volumeInfo.title = newValue !== 'Titre inconnu' ? newValue : null;
            }

            // Sauvegarder dans la base de données
            const isbn = this.getISBNFromBook(this.currentBook);
            if (isbn) {
                bookDatabase.updateBookField(isbn, fieldName, this.currentBook.volumeInfo[fieldName]);
            }
        }
        
        if (fieldName === 'title') {
            valueDiv.querySelector('h2').childNodes[0].nodeValue = newValue + ' ';
        } else {
            valueDiv.textContent = newValue;
        }
        
        const isStillUnknown = newValue === 'Inconnu' || newValue === 'Inconnue' || newValue === 'Titre inconnu';
        
        if (isStillUnknown) {
            metaItem.classList.add('unknown');
            if (fieldName !== 'title') {
                valueDiv.classList.add('unknown');
            }
        } else {
            metaItem.classList.remove('unknown');
            if (fieldName !== 'title') {
                valueDiv.classList.remove('unknown');
            }
            
            // Mettre à jour le bouton
            const editBtn = metaItem.querySelector('.edit-field-btn');
            if (editBtn) {
                editBtn.textContent = 'Modifier';
            }

            const helpMessage = metaItem.querySelector('.unknown-field-message');
            if (helpMessage) {
                helpMessage.remove();
            }
        }
        
        valueDiv.style.display = 'block';
        editDiv.style.display = 'none';
    }

    /**
     * Basculer l'édition des catégories
     */
    toggleEditCategories() {
        const display = document.getElementById('categoriesDisplay');
        const edit = document.getElementById('categoriesEdit');
        
        display.style.display = 'none';
        edit.style.display = 'block';
        
        document.getElementById('categoriesInput').focus();
    }

    /**
     * Annuler l'édition des catégories
     */
    cancelEditCategories() {
        const display = document.getElementById('categoriesDisplay');
        const edit = document.getElementById('categoriesEdit');
        
        display.style.display = 'flex';
        edit.style.display = 'none';
    }

    /**
     * Sauvegarder les catégories
     */
    saveCategories() {
        const input = document.getElementById('categoriesInput');
        const display = document.getElementById('categoriesDisplay');
        const edit = document.getElementById('categoriesEdit');
        const metaItem = document.querySelector('[data-field="categories"]');
        
        const newCategories = input.value
            .split(',')
            .map(cat => cat.trim())
            .filter(cat => cat.length > 0);
        
        if (newCategories.length === 0) {
            newCategories.push('Inconnue');
        }
        
        // Mettre à jour les données du livre
        if (this.currentBook && this.currentBook.volumeInfo) {
            this.currentBook.volumeInfo.categories = newCategories;
            
            const isbn = this.getISBNFromBook(this.currentBook);
            if (isbn) {
                bookDatabase.updateBookField(isbn, 'categories', newCategories);
            }
        }
        
        const isUnknown = newCategories.length === 1 && newCategories[0].toLowerCase() === 'inconnue';
        
        display.innerHTML = newCategories.map(cat => 
            `<span class="category-tag ${isUnknown ? 'unknown' : ''}">${cat}</span>`
        ).join('');
        
        if (isUnknown) {
            metaItem.classList.add('unknown');
            if (!metaItem.querySelector('.unknown-field-message')) {
                const message = document.createElement('div');
                message.className = 'unknown-field-message';
                message.innerHTML = `
                    <strong>Catégorie manquante !</strong> Aidez-nous en ajoutant une catégorie pour ce livre.<br>
                    <em>Exemples : Fiction, Science-fiction, Historique, Romance, Biographie, Essai, Poésie, Thriller, Fantastique...</em>
                `;
                display.parentNode.insertBefore(message, edit);
            }
        } else {
            metaItem.classList.remove('unknown');
            const message = metaItem.querySelector('.unknown-field-message');
            if (message) {
                message.remove();
            }
            const editBtn = metaItem.querySelector('.edit-btn');
            if (editBtn) {
                editBtn.textContent = 'Modifier';
            }
        }
        
        display.style.display = 'block';
        edit.style.display = 'none';
    }

    /**
     * Basculer l'édition de la description
     */
    toggleEditDescription() {
        const textDiv = document.getElementById('descriptionText');
        const editDiv = document.getElementById('descriptionEdit');
        const input = document.getElementById('descriptionInput');
        
        textDiv.style.display = 'none';
        editDiv.style.display = 'block';
        input.focus();
    }

    /**
     * Annuler l'édition de la description
     */
    cancelEditDescription() {
        const textDiv = document.getElementById('descriptionText');
        const editDiv = document.getElementById('descriptionEdit');
        const messageDiv = document.querySelector('[data-field="description"] .unknown-field-message');
        
        textDiv.style.display = 'block';
        editDiv.style.display = 'none';
        if (messageDiv) {
            messageDiv.style.display = 'block';
        }
    }

    /**
     * Sauvegarder la description
     */
    saveDescription() {
        const input = document.getElementById('descriptionInput');
        const textDiv = document.getElementById('descriptionText');
        const editDiv = document.getElementById('descriptionEdit');
        const metaItem = document.querySelector('[data-field="description"]');
        const messageDiv = metaItem.querySelector('.unknown-field-message');
        
        let newDescription = input.value.trim();
        
        if (!newDescription) {
            newDescription = 'Aucune description disponible';
        }
        
        // Mettre à jour les données du livre
        if (this.currentBook && this.currentBook.volumeInfo) {
            this.currentBook.volumeInfo.description = newDescription !== 'Aucune description disponible' ? newDescription : null;
            
            const isbn = this.getISBNFromBook(this.currentBook);
            if (isbn) {
                bookDatabase.updateBookField(isbn, 'description', this.currentBook.volumeInfo.description);
            }
        }
        
        textDiv.innerHTML = newDescription;
        
        const isStillEmpty = newDescription === 'Aucune description disponible';
        
        if (isStillEmpty) {
            metaItem.classList.add('unknown');
            textDiv.classList.add('unknown');
            if (messageDiv) {
                messageDiv.style.display = 'block';
            }
        } else {
            metaItem.classList.remove('unknown');
            textDiv.classList.remove('unknown');
            
            if (messageDiv) {
                messageDiv.remove();
            }
            
            const label = metaItem.querySelector('.meta-label');
            const button = label.querySelector('button');
            if (button) {
                button.textContent = 'Modifier';
                button.className = 'edit-btn';
            }
        }
        
        textDiv.style.display = 'block';
        editDiv.style.display = 'none';
    }

    /**
     * Extraire l'ISBN d'un livre
     */
    getISBNFromBook(book) {
        // Méthode 1: Depuis les industryIdentifiers
        if (book && book.volumeInfo && book.volumeInfo.industryIdentifiers) {
            for (let identifier of book.volumeInfo.industryIdentifiers) {
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
     * Afficher un message de succès temporaire pour l'upload de couverture
     */
    showCoverUploadSuccess() {
        const successMessage = document.createElement('div');
        successMessage.className = 'cover-upload-success';
        successMessage.innerHTML = '✅ Couverture sauvegardée !';
        successMessage.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--black);
            color: var(--white);
            padding: 12px 20px;
            border: 2px solid var(--black);
            font-weight: 500;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            z-index: 1001;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
            if (successMessage.parentNode) {
                successMessage.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => {
                    if (successMessage.parentNode) {
                        successMessage.parentNode.removeChild(successMessage);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Instance globale de l'interface utilisateur
const ui = new UIManager();