const AppState = {
    apiKey: localStorage.getItem('google_maps_api_key') || null,
    map: null,
    placesService: null,
    markers: [],
    currentInfoWindow: null,
    currentResults: [],
    detailsCache: {}, // { place_id: { website, phone, ... } }
    showWithoutWebOnly: false,
    htmlTemplate: localStorage.getItem('cz_locator_html_template') // null if not set
};

// Data pro kraje ČR (přibližné souřadnice středů a zoom)
const CZ_REGIONS = {
    "Hlavní město Praha": { lat: 50.0755, lng: 14.4378, zoom: 11 },
    "Středočeský kraj": { lat: 49.95, lng: 14.3, zoom: 9 },
    "Jihočeský kraj": { lat: 49.1, lng: 14.5, zoom: 9 },
    "Plzeňský kraj": { lat: 49.6, lng: 13.3, zoom: 9 },
    "Karlovarský kraj": { lat: 50.2, lng: 12.7, zoom: 9 },
    "Ústecký kraj": { lat: 50.6, lng: 14.0, zoom: 9 },
    "Liberecký kraj": { lat: 50.7, lng: 14.9, zoom: 9 },
    "Královéhradecký kraj": { lat: 50.4, lng: 15.9, zoom: 9 },
    "Pardubický kraj": { lat: 49.9, lng: 16.2, zoom: 9 },
    "Kraj Vysočina": { lat: 49.4, lng: 15.6, zoom: 9 },
    "Jihomoravský kraj": { lat: 49.1, lng: 16.7, zoom: 9 },
    "Olomoucký kraj": { lat: 49.7, lng: 17.1, zoom: 9 },
    "Zlínský kraj": { lat: 49.2, lng: 17.8, zoom: 9 },
    "Moravskoslezský kraj": { lat: 49.8, lng: 18.2, zoom: 9 }
};

// DOM Elementy
const DOM = {
    modal: document.getElementById('api-modal'),
    apiKeyInput: document.getElementById('api-key-input'),
    btnSaveApiKey: document.getElementById('save-api-key'),
    appContainer: document.getElementById('app-container'),
    btnSettings: document.getElementById('settings-btn'),
    
    regionSelect: document.getElementById('region-select'),
    searchQuery: document.getElementById('search-query'),
    btnSearch: document.getElementById('search-btn'),
    sortSelect: document.getElementById('sort-select'),
    noWebFilter: document.getElementById('no-web-filter'),
    
    mapOverlay: document.getElementById('map-overlay'),
    
    resultsList: document.getElementById('results-list'),
    resultsCount: document.getElementById('results-count'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    templateBtn: document.getElementById('template-btn'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state'),
    
    promptModal: document.getElementById('prompt-modal'),
    closePromptModal: document.getElementById('close-prompt-modal'),
    promptCompanyName: document.getElementById('prompt-company-name'),
    promptTextarea: document.getElementById('prompt-textarea'),
    copyPromptBtn: document.getElementById('copy-prompt-btn'),
    
    templateModal: document.getElementById('template-modal'),
    templateTextarea: document.getElementById('template-textarea'),
    saveNoTemplateBtn: document.getElementById('save-no-template-btn'),
    saveTemplateBtn: document.getElementById('save-template-btn')
};

// ----- Inicializace a správa API Klíče -----

function initApp() {
    if (AppState.apiKey) {
        loadGoogleMapsScript();
        showApp();
    } else {
        showModal();
    }

    // Nastavení event listenerů
    DOM.btnSaveApiKey.addEventListener('click', () => {
        const key = DOM.apiKeyInput.value.trim();
        if (key.length > 20) { // Jednoduchá validace délky
            saveApiKey(key);
            loadGoogleMapsScript();
            showApp();
        } else {
            alert('Zadejte prosím platný API klíč.');
        }
    });

    DOM.btnSettings.addEventListener('click', showModal);

    DOM.btnSearch.addEventListener('click', () => {
        if (AppState.htmlTemplate === null) {
            showTemplateModal();
        } else {
            handleSearch();
        }
    });
    
    DOM.searchQuery.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (AppState.htmlTemplate === null) {
                showTemplateModal();
            } else {
                handleSearch();
            }
        }
    });

    if(DOM.templateBtn) {
        DOM.templateBtn.addEventListener('click', showTemplateModal);
    }
    
    if(DOM.saveNoTemplateBtn) {
        DOM.saveNoTemplateBtn.addEventListener('click', () => {
            saveHtmlTemplate("");
            DOM.templateModal.classList.add('hidden');
            handleSearch();
        });
    }
    
    if(DOM.saveTemplateBtn) {
        DOM.saveTemplateBtn.addEventListener('click', () => {
            const val = DOM.templateTextarea.value.trim();
            saveHtmlTemplate(val);
            DOM.templateModal.classList.add('hidden');
            handleSearch();
        });
    }

    if(DOM.sortSelect) {
        DOM.sortSelect.addEventListener('change', () => {
            if (AppState.currentResults.length > 0) {
                filterAndRenderPlacesLocally();
            }
        });
    }

    if(DOM.noWebFilter) {
        DOM.noWebFilter.addEventListener('change', (e) => {
            AppState.showWithoutWebOnly = e.target.checked;
            if (AppState.currentResults.length > 0) {
                filterAndRenderPlacesLocally();
            }
        });
    }
    
    if(DOM.closePromptModal) {
        DOM.closePromptModal.addEventListener('click', () => {
            DOM.promptModal.classList.add('hidden');
        });
    }
    
    if(DOM.copyPromptBtn) {
        DOM.copyPromptBtn.addEventListener('click', () => {
            DOM.promptTextarea.select();
            navigator.clipboard.writeText(DOM.promptTextarea.value).then(() => {
                const originalText = DOM.copyPromptBtn.innerHTML;
                DOM.copyPromptBtn.innerHTML = '<i class="ph ph-check"></i> Zkopírováno!';
                setTimeout(() => {
                    DOM.copyPromptBtn.innerHTML = originalText;
                }, 2000);
            });
        });
    }

    if(DOM.exportCsvBtn) {
        DOM.exportCsvBtn.addEventListener('click', handleCSVExport);
    }
}

function saveHtmlTemplate(html) {
    AppState.htmlTemplate = html;
    localStorage.setItem('cz_locator_html_template', html);
}

function showTemplateModal() {
    DOM.templateModal.classList.remove('hidden');
    if (AppState.htmlTemplate) {
        DOM.templateTextarea.value = AppState.htmlTemplate;
    }
}

function saveApiKey(key) {
    localStorage.setItem('google_maps_api_key', key);
    AppState.apiKey = key;
}

function showModal() {
    DOM.modal.classList.remove('hidden');
    DOM.appContainer.classList.add('hidden');
    if (AppState.apiKey) DOM.apiKeyInput.value = AppState.apiKey;
}

function showApp() {
    DOM.modal.classList.add('hidden');
    DOM.appContainer.classList.remove('hidden');
}

// Dynamické načtení Google Maps skriptu s API klíčem
function loadGoogleMapsScript() {
    // Odstranění starého skriptu na změnu klíče za běhu
    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) existingScript.remove();

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    // Načítáme knihovny: places pro hledání, core a maps pro mapu
    script.src = `https://maps.googleapis.com/maps/api/js?key=${AppState.apiKey}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    
    // Ošetření chyby klíče
    script.onerror = () => {
        alert("Při načítání map Google došlo k chybě. Zkontrolujte prosím váš API klíč a internetové připojení.");
        showModal();
    };

    document.head.appendChild(script);
}

// ----- Mapy a Lokace -----

// Voláno Google skriptem po načtení
window.initMap = function() {
    // Inicializujeme středem ČR, ale schováme za overlay, dokud uživatel nevyhledává
    const centerCZ = { lat: 49.8175, lng: 15.4730 };
    
    AppState.map = new google.maps.Map(document.getElementById('map'), {
        center: centerCZ,
        zoom: 7,
        mapId: 'CZ_PLACES_MAP_ID', // Modernější vykreslování
        disableDefaultUI: false,
        styles: getMapStyles() // Lehce upravíme pro glass vzhled
    });

    AppState.placesService = new google.maps.places.PlacesService(AppState.map);
    AppState.currentInfoWindow = new google.maps.InfoWindow();
};

function handleSearch() {
    const regionName = DOM.regionSelect.value;
    const query = DOM.searchQuery.value.trim();

    if (!regionName || !query) {
        alert("Prosím vyberte kraj a zadejte hledaný výraz.");
        return;
    }

    const regionData = CZ_REGIONS[regionName];
    if (!regionData || !AppState.placesService) return;

    // Uzavřít infowindow pokud je nějaké otevřené
    AppState.currentInfoWindow.close();

    // Přesunout se na vybraný kraj
    AppState.map.setCenter({ lat: regionData.lat, lng: regionData.lng });
    AppState.map.setZoom(regionData.zoom);
    DOM.mapOverlay.classList.add('hidden'); // Skrýt initial overlay mapy

    uiStateLoading();
    clearMarkers();

    // Vyhledávací dotaz (např. "veterina v Moravskoslezský kraj")
    const searchQuery = `${query} v ${regionName}, Česká republika`;

    const request = {
        query: searchQuery,
        // Dáme prioritu výsledkům v daném regionu
        location: new google.maps.LatLng(regionData.lat, regionData.lng),
        radius: 50000 // 50km rádius jako nápověda, ale PlacesAPI samo řeší "v oblasti X" z query
    };

    AppState.placesService.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            AppState.currentResults = results;
            filterAndRenderPlacesLocally();
        } else {
            AppState.currentResults = [];
            uiStateEmpty();
            if (status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                DOM.emptyState.innerHTML = `
                    <i class="ph ph-warning" style="color: #ef4444;"></i>
                    <p>Chyba Google API: <strong>${status}</strong></p>
                    <p style="font-size: 0.85rem; max-width: 80%;">Pokud vidíte REQUEST_DENIED, nemáte povolené "Places API" (ne to New, ale to staré), nebo máte problém s fakturací / omezením klíče.</p>
                `;
            } else {
                DOM.emptyState.innerHTML = `
                    <i class="ph ph-list-magnifying-glass"></i>
                    <p>Zatím žádné výsledky a nebo Google nenašel vůbec nic.</p>
                `;
            }
        }
    });
}

function filterAndRenderPlacesLocally() {
    let results = [...AppState.currentResults];
    
    const sortVal = DOM.sortSelect ? DOM.sortSelect.value : 'best_rating';
    
    results.sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        const revA = a.user_ratings_total || 0;
        const revB = b.user_ratings_total || 0;
        
        if (sortVal === 'best_rating') {
            return ratingB !== ratingA ? ratingB - ratingA : revB - revA;
        } else if (sortVal === 'worst_rating') {
            return ratingA !== ratingB ? ratingA - ratingB : revA - revB;
        } else if (sortVal === 'most_reviews') {
            return revB !== revA ? revB - revA : ratingB - ratingA;
        } else if (sortVal === 'least_reviews') {
            return revA !== revB ? revA - revB : ratingA - ratingB;
        }
        return ratingB - ratingA;
    });

    DOM.resultsList.innerHTML = '';
    clearMarkers();
    
    const bounds = new google.maps.LatLngBounds();
    let renderedCount = 0;

    results.forEach((place, index) => {
        const detail = AppState.detailsCache[place.place_id];
        
        // Okamžitá filtrace pro místa, u kterých UŽ známe detaily a mají web
        if (AppState.showWithoutWebOnly && detail && detail.website) {
            return; 
        }

        renderedCount++;

        setTimeout(() => {
            createMarker(place);
        }, renderedCount * 50);
        
        if (place.geometry && place.geometry.location) {
            bounds.extend(place.geometry.location);
        }

        renderResultCard(place);
    });

    DOM.resultsCount.textContent = `${renderedCount} nalezeno`;
    DOM.resultsCount.classList.remove('hidden');
    if (DOM.exportCsvBtn && renderedCount > 0) {
        DOM.exportCsvBtn.classList.remove('hidden');
    }

    if (renderedCount > 0 && !bounds.isEmpty()) {
        AppState.map.fitBounds(bounds);
        
        const listener = google.maps.event.addListener(AppState.map, "idle", function() { 
            if (AppState.map.getZoom() > 14) AppState.map.setZoom(14); 
            google.maps.event.removeListener(listener); 
        });
        uiStateResults();
    } else {
        if (DOM.exportCsvBtn) DOM.exportCsvBtn.classList.add('hidden');
        uiStateEmpty();
    }
}

function createMarker(place) {
    if (!place.geometry || !place.geometry.location) return;

    const marker = new google.maps.Marker({
        map: AppState.map,
        position: place.geometry.location,
        title: place.name,
        animation: google.maps.Animation.DROP,
    });

    // Při kliknutí na marker otevřeme bublinu (infowindow) a zvýrazníme v seznamu
    marker.addListener("click", () => {
        const contentStr = `
            <div style="color: #333; padding: 5px;">
                <h4 style="margin: 0 0 5px 0; font-family: Inter, sans-serif;">${place.name}</h4>
                <p style="margin: 0 0 5px 0; font-size: 12px;">${place.formatted_address}</p>
                <div style="font-weight: bold; color: #f59e0b;">⭐ ${place.rating || 'Bez hodnocení'}</div>
            </div>
        `;
        AppState.currentInfoWindow.setContent(contentStr);
        AppState.currentInfoWindow.open(AppState.map, marker);
        
        // Scroll na kartu v seznamu
        const card = document.getElementById(`place-${place.place_id}`);
        if(card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Zvýraznění (glass border bounce)
            card.style.borderColor = 'var(--accent-color)';
            card.style.background = 'rgba(255, 255, 255, 0.1)';
            setTimeout(() => {
                card.style.borderColor = 'var(--glass-border)';
                card.style.background = '';
            }, 1500);
        }
    });

    AppState.markers.push(marker);
}

function renderResultCard(place) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = `place-${place.place_id}`;

    const rating = place.rating || 0;
    const ratingHtml = rating > 0 
        ? `<span>${rating.toFixed(1)}</span>
           <i class="ph-fill ph-star"></i>
           <span class="reviews-count">(${place.user_ratings_total || 0})</span>`
        : `<span style="color: var(--text-secondary); font-size: 0.8rem;">Bez hodnocení</span>`;

    card.innerHTML = `
        <div class="card-header" style="flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; align-items: flex-start;">
            <div class="card-title-row">
                <h3 style="margin: 0;">${place.name}</h3>
                <span id="web-badge-${place.place_id}" class="web-badge loading"><i class="ph ph-spinner ph-spin"></i> Načítám...</span>
            </div>
            <div class="rating">${ratingHtml}</div>
        </div>
        <p class="address">
            <i class="ph-fill ph-map-pin"></i> 
            ${place.formatted_address.replace(', Česká republika', '')}
        </p>
        <div id="details-container-${place.place_id}" style="margin-bottom: 0.5rem;"></div>
        
        <div id="email-container-${place.place_id}" style="margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.4rem;"></div>

        <div class="action-buttons-row">
            <button class="btn-primary btn-outline btn-discard" id="discard-${place.place_id}">Zahodit (Dobrý web)</button>
            <button class="btn-primary btn-outline" id="audit-${place.place_id}" style="display: none; border-color: #6366f1; color: #6366f1;"><i class="ph-bold ph-file-pdf"></i> PDF SEO Audit</button>
            <button class="btn-primary btn-prompt" id="prompt-${place.place_id}">Vygenerovat prompt</button>
        </div>
    `;

    DOM.resultsList.appendChild(card);

    // Event listener pro marker na mapě přes hover
    card.addEventListener('mouseenter', () => {
        const marker = AppState.markers.find(m => m.title === place.name);
        if(marker) marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => { if(marker) marker.setAnimation(null); }, 750);
    });

    // Event listener pro Skrytí (Zahodit)
    card.querySelector(`#discard-${place.place_id}`).addEventListener('click', () => {
        card.style.display = 'none';
        const marker = AppState.markers.find(m => m.title === place.name);
        if (marker) marker.setMap(null);
    });

    // Event listener pro Vygenerovat prompt
    card.querySelector(`#prompt-${place.place_id}`).addEventListener('click', () => {
        const detail = AppState.detailsCache[place.place_id];
        const promptText = generateSmartPrompt(place, detail);

        DOM.promptCompanyName.textContent = place.name;
        DOM.promptTextarea.value = promptText;
        DOM.promptModal.classList.remove('hidden');
    });

    // Načítáme detaily na pozadí, abychom zjistili, zda má firma web
    fetchDetailsAndRender(place.place_id, card);
}

function generateSmartPrompt(place, detail) {
    const hasWeb = detail && detail.website;
    const phone = detail && detail.formatted_phone_number ? detail.formatted_phone_number : 'Neznámý';
    const ratingStr = place.rating ? `${place.rating} (z ${place.user_ratings_total} recenzí)` : 'N/A';
    
    const busStatusMap = {
        'OPERATIONAL': 'V provozu',
        'CLOSED_TEMPORARILY': 'Dočasně uzavřeno',
        'CLOSED_PERMANENTLY': 'Trvale uzavřeno'
    };
    const busStatus = place.business_status ? (busStatusMap[place.business_status] || place.business_status) : 'Neznámý';
    const typesStr = place.types ? place.types.join(', ') : 'Neznámé';
    const webStr = hasWeb ? detail.website : 'Žádný';
    
    let openingHoursStr = 'Neznámá';
    if (detail && detail.opening_hours && detail.opening_hours.weekday_text) {
        openingHoursStr = '\n  ' + detail.opening_hours.weekday_text.join('\n  ');
    }

    let reviewsStr = '';
    if (detail && detail.reviews && detail.reviews.length > 0) {
        const bestReviews = detail.reviews.filter(r => r.text && r.text.length > 15 && r.rating >= 4).slice(0, 3);
        if (bestReviews.length > 0) {
            reviewsStr = "\n\n---\nZde jsou reálné pozitivní recenze od zákazníků firmy:\n" + bestReviews.map(r => `"${r.text}"`).join('\n\n') + "\n---\nZahrň tyto recenze do návrhu webu do sekce 'Reference' nebo 'Co o nás říkají', přidej jim dynamický a pěkný design.";
        }
    }
    
    let auditInstruction = "";
    if (detail && detail.analysis && detail.analysis.length > 0) {
        auditInstruction = `\n\nNEDOSTATKY SOUČASNÉHO WEBU (Použij jako prodejní argumenty):\n- ${detail.analysis.join('\n- ')}`;
    }

    let analysisInstruction = "";
    if (hasWeb) {
        if (detail.scrapedText) {
            analysisInstruction = `\n\nPOZNÁMKA K ANALÝZE WEBU:
Aplikace již navštívila stávající web klienta (${webStr}) a vytáhla z něj tento hrubý text (jsou to vyextrahované věty z jejich stránky):
"""
${detail.scrapedText}
"""
TVÝM ÚKOLEM je pečlivě projít tento výše uvedený hrubý text, zjistit z něj REÁLNÉ služby a specifické prodejní argumenty firmy, a tyto informace plynule a logicky začlenit do nového návrhu webu v HTML kódu! Nepiš žádné "lorem ipsum" výplně, pokud v textu najdeš skutečné informace!`;
        } else {
            analysisInstruction = `\n\nPOZNÁMKA K ANALÝZE: Firma momentálně web má (${webStr}). Úkolem je ho zlepšit. Podívej se zkusmo na něj (např. pomocí search funkce), vytáhni si fakta o jejich službách a zvaž tyto reálné texty do nového kódu zahrnout.`;
        }
    }

    const emailStrPrompt = detail && detail.scrapedEmail ? `\n- Email: ${detail.scrapedEmail}` : '';

    let promptText = "";
    
    // UŽIVATEL MÁ ŠABLONU -> Použije se 
    if (AppState.htmlTemplate && AppState.htmlTemplate.length > 0) {
        promptText = `Mám připravený HTML kód a sadu textových informací. Tvým úkolem je vložit tyto informace do kódu a upravit ho podle následujících pravidel:

Vložení obsahu: Vepiš poskytnuté informace na správná a logická místa v HTML kódu.

Zacházení s chybějícím obsahem: Pokud pro nějakou část (sekci) HTML struktury nebudou v dodaných textech informace, tuto sekci do kódu vůbec nedávej a rovnou ji bezpečně odstraň (nenechávej žádné prázdné tagy).

Návrhy na náhradu: Ke každé sekci, kterou jsi musel vynechat/smazat, mi na konec výstupu napiš stručné upozornění a navrhni možnost jejího doplnění nebo nahrazení za jinou vhodnou sekci (jakým jiným prvkem či obsahem by se dala chybějící část vyřešit).

Responzivita a vizuál: Důkladně zkontroluj strukturu a třídy. Výsledný kód musí zůstat 100% responzivní (bezchybný na PC i mobilu). Všechny prvky musí být správně vycentrované, zarovnané a vizuálně čisté – nesmí vzniknout žádné "úskoky", rozbité okraje nebo nelogické mezery.

Nejprve mi pošli kompletní upravený HTML kód a pod něj připiš svá doporučení a návrhy k chybějícím sekcím.

Zde jsou informace k vložení:
- Název: ${place.name}
- Adresa: ${place.formatted_address}
- Kontakt: ${phone}${emailStrPrompt}
- Hodnocení na Google: ${ratingStr}
- Status podniku: ${busStatus}
- Kategorie na mapě: ${typesStr}
- Otevírací doba: ${openingHoursStr}${reviewsStr}${analysisInstruction}${auditInstruction}

Zde je můj HTML kód:
${AppState.htmlTemplate}`;
        
    } else {
        // UŽIVATEL NEMÁ ŠABLONU -> Tvoří se od nuly
        promptText = `Vytvoř mi kompletní, responzivní a moderní návrh one-page webové stránky v HTML a CSS. 

Zde jsou rozšířená reálná data firmy, na kterou má být web zacílen:
- Název: ${place.name}
- Adresa: ${place.formatted_address}
- Kontakt: ${phone}${emailStrPrompt}
- Hodnocení na Google: ${ratingStr}
- Status podniku: ${busStatus}
- Kategorie na mapě: ${typesStr}
- Otevírací doba: ${openingHoursStr}${reviewsStr}${analysisInstruction}${auditInstruction}

Pravidla:
1. Navrhni logickou strukturu (Hlavička, O nás, Služby, Kontakt, Recenze z Google map).
2. Obsah vlož přímo do kódu podle poskytnutých dat.
3. Design musí působit profesionálně, důvěryhodně a musí být plně optimalizovaný pro mobilní zařízení.`;
    }
    
    return promptText;
}

function fetchDetailsAndRender(placeId, cardElement) {
    const badge = cardElement.querySelector(`#web-badge-${placeId}`);
    const detailsContainer = cardElement.querySelector(`#details-container-${placeId}`);
    
    // Pokud už máme v cache, rovnou použijeme
    if (AppState.detailsCache[placeId]) {
        applyDetailsToCard(placeId, cardElement, AppState.detailsCache[placeId], badge, detailsContainer);
        return;
    }

    const request = {
        placeId: placeId,
        fields: ['website', 'formatted_phone_number', 'reviews', 'opening_hours']
    };

    AppState.placesService.getDetails(request, async (detailPlace, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && detailPlace) {
            AppState.detailsCache[placeId] = detailPlace;
            applyDetailsToCard(placeId, cardElement, detailPlace, badge, detailsContainer);
            
            if (detailPlace.website) {
                // Přidáme UI indikátor do karty, že se stahuje kód
                const scrapIndicator = document.createElement('div');
                scrapIndicator.style.fontSize = '0.75rem';
                scrapIndicator.style.color = 'var(--text-secondary)';
                scrapIndicator.style.marginTop = '0.5rem';
                scrapIndicator.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Čtu text z webu klienta...';
                
                // Připneme indikátor za detaily
                const detailsBox = cardElement.querySelector('.place-details');
                if (detailsBox) detailsBox.appendChild(scrapIndicator);
                
                // Zavoláme scrapování weba
                const scrapedData = await scrapeWebsiteText(detailPlace.website);
                detailPlace.scrapedText = scrapedData ? scrapedData.text : null;
                detailPlace.scrapedEmail = scrapedData ? scrapedData.email : null;
                
                // Analýza webu
                detailPlace.analysis = [];
                if (scrapedData && !scrapedData.hasHttps) {
                    detailPlace.analysis.push('Chybí HTTPS zabezpečení');
                }
                if (scrapedData && !scrapedData.hasViewport) {
                    detailPlace.analysis.push('Web není responzivní pro mobilní telefony (chybí meta viewport)');
                }
                if (scrapedData && scrapedData.contentLength < 300) {
                    detailPlace.analysis.push('Web má velmi málo textového obsahu (špatné pro SEO)');
                }
                
                detailPlace.scrapingDone = true;
                
                if (detailPlace.scrapedText) {
                    scrapIndicator.style.color = '#10b981';
                    scrapIndicator.innerHTML = '<i class="ph ph-check"></i> Web načten a analyzován';
                    
                    if (detailPlace.analysis && detailPlace.analysis.length > 0) {
                        const auditHtml = `<ul style="margin: 0.5rem 0 0 0; padding-left: 1.2rem; color: #ef4444; font-size: 0.8rem;">
                            ${detailPlace.analysis.map(a => `<li>${a}</li>`).join('')}
                        </ul>`;
                        
                        const auditContainer = document.createElement('div');
                        auditContainer.innerHTML = auditHtml;
                        cardElement.querySelector('.place-details').appendChild(auditContainer);
                    }
                    
                    const emailContainer = cardElement.querySelector(`#email-container-${placeId}`);
                    if (emailContainer) {
                        if (detailPlace.scrapedEmail) {
                            emailContainer.innerHTML = `<i class="ph-fill ph-envelope-simple"></i> Nalezený email: <a href="mailto:${detailPlace.scrapedEmail}" style="color: var(--accent-color); font-weight: 500; text-decoration: none;">${detailPlace.scrapedEmail}</a>`;
                        } else {
                            emailContainer.innerHTML = `<i class="ph ph-envelope-simple"></i> Email na webu nenalezen`;
                        }
                    }
                } else {
                    scrapIndicator.style.color = '#ef4444';
                    scrapIndicator.innerHTML = '<i class="ph ph-warning"></i> Web nelze přečíst, pro AI bude vynechán';
                }
            } else {
                detailPlace.scrapingDone = true;
            }
        } else {
            badge.className = 'web-badge no-web';
            badge.innerHTML = 'Google chyba';
        }
    });
}
    
async function scrapeWebsiteText(targetUrl) {
    try {
        let isHttpsCapable = targetUrl.startsWith('https://');
        let response = null;

        if (!isHttpsCapable && targetUrl.startsWith('http://')) {
            const httpsUrl = targetUrl.replace('http://', 'https://');
            response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(httpsUrl)}`);
            if (response.ok) {
                isHttpsCapable = true;
            } else {
                // Fallback na HTTP
                response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
            }
        } else {
            response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
        }
        
        if (!response || !response.ok) return null;
        
        const htmlData = await response.text();
        if (!htmlData) return null;
        
        let foundEmail = null;
        // Nejdříve mailto odkaz
        const mailtoMatch = htmlData.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (mailtoMatch && mailtoMatch[1]) {
            foundEmail = mailtoMatch[1];
        } else {
            // Nebo regexem cokoliv, co vypadá jako email
            const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
            let match;
            while ((match = emailRegex.exec(htmlData)) !== null) {
                const mail = match[1].toLowerCase();
                // Ignorujeme maily typu .png, .jpg, .webp, gdpr@ atd
                if (!mail.endsWith('.png') && !mail.endsWith('.jpg') && !mail.endsWith('.jpeg') && !mail.endsWith('.webp') && !mail.endsWith('.gif')) {
                    if (!mail.includes('sentry') && !mail.includes('rating@')) {
                        foundEmail = match[1];
                        break;
                    }
                }
            }
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlData, "text/html");
        
        // Analýza kvality webu
        const hasViewport = !!doc.querySelector('meta[name="viewport"]');

        // Odstranění plevelu (skripty, styly, navigace atd.)
        doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer').forEach(el => el.remove());
        
        let text = doc.body.innerText || "";
        
        // Zarovnání a odstranění nadbytečných mezer
        text = text.replace(/\\s+/g, ' ').trim();
        
        const contentLength = text.length;

        // Omezíme délku, ať nezahltíme tokenový limit LLM (např. 2500 znaků stačí na služby)
        if (text.length > 2500) text = text.substring(0, 2500) + '...';
        
        return { text: text, email: foundEmail, hasViewport: hasViewport, contentLength: contentLength, hasHttps: isHttpsCapable };
    } catch (e) {
        console.error("Chyba proxy scrapování:", e);
        return null;
    }
}

function applyDetailsToCard(placeId, cardElement, detailPlace, badge, detailsContainer) {
    const hasWeb = !!detailPlace.website;
    
    // Filtrování pokud je nastaveno Zobrazit pouze bez webu
    if (AppState.showWithoutWebOnly && hasWeb) {
        cardElement.style.display = 'none';
        const marker = AppState.markers.find(m => m.title === cardElement.querySelector('h3').textContent);
        if (marker) marker.setMap(null);
        return;
    }

    if (hasWeb) {
        badge.className = 'web-badge has-web';
        badge.innerHTML = '🟢 [MÁ WEB]';
        
        const auditBtn = cardElement.querySelector(`#audit-${placeId}`);
        if(auditBtn) {
            auditBtn.style.display = 'inline-flex';
            auditBtn.addEventListener('click', () => {
                window.open(`http://localhost:3000/?url=${encodeURIComponent(detailPlace.website)}`, '_blank');
            });
        }
    } else {
        badge.className = 'web-badge no-web';
        badge.innerHTML = '🔴 [NEMÁ WEBOVKY]';
    }

    let htmlContent = '<div class="place-details" style="margin-top: 0; padding-top: 0.5rem; border: none;">';
    
    // Telefon
    if (detailPlace.formatted_phone_number) {
        htmlContent += `
            <div class="detail-row">
                <i class="ph-fill ph-phone-call"></i>
                <a href="tel:${detailPlace.formatted_phone_number.replace(/\s+/g, '')}">${detailPlace.formatted_phone_number}</a>
            </div>
        `;
    }

    // Web
    if (detailPlace.website) {
        htmlContent += `
            <div class="detail-row">
                <i class="ph-fill ph-globe"></i>
                <a href="${detailPlace.website}" target="_blank">${detailPlace.website}</a>
            </div>
        `;
    }

    // Recenze
    if (detailPlace.reviews && detailPlace.reviews.length > 0) {
         const validReview = detailPlace.reviews.find(r => r.text && r.text.trim().length > 10);
         if (validReview) {
             const starIcons = Array.from({length: validReview.rating}, () => '<i class="ph-fill ph-star" style="color: var(--star-color);"></i>').join('');
             htmlContent += `
                <div class="review-box" style="margin-top: 0.5rem;">
                    <div class="review-author">
                        <img src="${validReview.profile_photo_url || 'https://via.placeholder.com/24'}" alt="Foto recenzenta">
                        <span>${validReview.author_name}</span>
                        <span style="margin-left:auto; font-size:0.8rem">${starIcons}</span>
                    </div>
                    <div class="review-text">"${validReview.text}"</div>
                </div>
             `;
         }
    }

    htmlContent += '</div>';
    detailsContainer.innerHTML = htmlContent;
}

// ----- CSV Export Funkce -----

async function handleCSVExport() {
    if (AppState.currentResults.length === 0) return;
    
    // Změníme UI tlačítka na načítání
    const originalText = DOM.exportCsvBtn.innerHTML;
    DOM.exportCsvBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Stahuji detaily z Google...';
    DOM.exportCsvBtn.disabled = true;

    // Počkat, dokud nebudou načteny asynchronní detaily A scrapování webu (max prodlouženo na ~8 sekund kvůli scrapování)
    for (const place of AppState.currentResults) {
        let attempts = 0;
        while (attempts < 40) {
            const cached = AppState.detailsCache[place.place_id];
            // Je hotovo, když detaily jsou v cache A buď nemá web, nebo scrapingDone je TRUE
            if (cached && (!cached.website || cached.scrapingDone)) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }
    }

    // Vytvoříme záhlaví pro CSV
    let csvRows = [];
    csvRows.push("sep=;"); // Návod pro Microsoft Excel pro správné určení oddělovače
    
    const removeDiacritics = (str) => {
        if (!str) return "";
        return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const headers = [
        "Nazev", "Adresa", "Telefon", "Ma Web", "Odkaz na Web", "Nalezeny Email", "Google Hodnoceni", 
        "Pocet Recenzi", "Status", "Kategorie", "Oteviraci Doba", "Nedostatky Webu"
    ];

    csvRows.push(headers.map(h => `"${removeDiacritics(h)}"`).join(";"));

    AppState.currentResults.forEach(place => {
        const detail = AppState.detailsCache[place.place_id] || {};
        
        // Zkontrolujeme, pokud je zapnutý filtr bez webu a tato firma má web (ignorovat v CSV)
        if (AppState.showWithoutWebOnly && detail.website) return;
        
        // Pokud user zahodil (hide) firmu z UI, nemusíme exportovat. (Volitelné, ale logické).
        const cardElement = document.getElementById(`place-${place.place_id}`);
        if(cardElement && cardElement.style.display === 'none') return;

        const hasWeb = detail.website ? "ANO" : "NE";
        const websiteStr = detail.website || "";
        const emailStr = detail.scrapedEmail || "";
        const phoneStr = detail.formatted_phone_number || "";
        const ratingStr = place.rating ? place.rating.toString() : "";
        const revCountStr = place.user_ratings_total ? place.user_ratings_total.toString() : "";
        const statusMap = {'OPERATIONAL': 'V provozu', 'CLOSED_TEMPORARILY':'Dočasně zavřeno', 'CLOSED_PERMANENTLY':'Trvale uzavřeno'};
        const statusStr = place.business_status ? (statusMap[place.business_status] || place.business_status) : "";
        const catStr = place.types ? place.types.join(", ") : "";
        
        let opHours = "";
        if(detail.opening_hours && detail.opening_hours.weekday_text) {
            opHours = detail.opening_hours.weekday_text.join("; ");
        }

        // Místo AI Promptu dáme Nedostatky webu
        const shortcomings = (detail.analysis && detail.analysis.length > 0) ? detail.analysis.join("; ") : "";

        const row = [
            `"${removeDiacritics(place.name || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(place.formatted_address || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(phoneStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(hasWeb || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(websiteStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(emailStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(ratingStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(revCountStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(statusStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(catStr || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(opHours || '').replace(/"/g, '""')}"`,
            `"${removeDiacritics(shortcomings).replace(/"/g, '""')}"`
        ];

        csvRows.push(row.join(";"));
    });

    const csvContent = "\uFEFF" + csvRows.join("\r\n"); // \uFEFF je BOM pro češtinu. \r\n je bezpečný konec řádku pro Excel.
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "vygenerovane_leady_a_prompty.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Obnovení stavu tlačítka
    setTimeout(() => {
        DOM.exportCsvBtn.innerHTML = '<i class="ph ph-check"></i> Exportováno';
        setTimeout(() => {
            DOM.exportCsvBtn.innerHTML = originalText;
            DOM.exportCsvBtn.disabled = false;
        }, 3000);
    }, 500);
}

// ----- UI Manipulace -----

function clearMarkers() {
    for (let i = 0; i < AppState.markers.length; i++) {
        AppState.markers[i].setMap(null);
    }
    AppState.markers = [];
}

function uiStateLoading() {
    DOM.emptyState.classList.add('hidden');
    DOM.resultsList.classList.add('hidden');
    DOM.loadingState.classList.remove('hidden');
    DOM.resultsCount.classList.add('hidden');
}

function uiStateEmpty() {
    DOM.loadingState.classList.add('hidden');
    DOM.resultsList.classList.add('hidden');
    DOM.emptyState.classList.remove('hidden');
    DOM.resultsCount.classList.add('hidden');
}

function uiStateResults() {
    DOM.loadingState.classList.add('hidden');
    DOM.emptyState.classList.add('hidden');
    DOM.resultsList.classList.remove('hidden');
}

// Minimalistický tmavý styl pro mapu (odpovídá paletě aplikace)
function getMapStyles() {
    return [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#263c3f" }],
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6b9a76" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#38414e" }],
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#212a37" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9ca5b3" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#746855" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1f2835" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#f3d19c" }],
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#2f3948" }],
        },
        {
          featureType: "transit.station",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#17263c" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#515c6d" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#17263c" }],
        },
      ];
}

// Spuštění
document.addEventListener('DOMContentLoaded', initApp);
