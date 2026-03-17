// Konfigurace a stav aplikace
const AppState = {
    apiKey: localStorage.getItem('google_maps_api_key') || null,
    map: null,
    placesService: null,
    markers: [],
    currentInfoWindow: null,
    favorites: JSON.parse(localStorage.getItem('cz_locator_favorites')) || [],
    showFavoritesOnly: false
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
    btnFavoriteFilter: document.getElementById('favorite-filter-btn'),
    
    mapOverlay: document.getElementById('map-overlay'),
    
    resultsList: document.getElementById('results-list'),
    resultsCount: document.getElementById('results-count'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state')
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

    DOM.btnSearch.addEventListener('click', handleSearch);
    DOM.searchQuery.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    if(DOM.btnFavoriteFilter) {
        DOM.btnFavoriteFilter.addEventListener('click', toggleFavoriteFilter);
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

    if (AppState.showFavoritesOnly) {
         // Pokud chceme zobrazit jen oblíbené v daném kraji, 
         // uděláme klasický dotaz pro aktualizaci dat
         // ale před zobrazením si je profiltrujeme.
    }

    AppState.placesService.textSearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            let finalResults = results;
            if(AppState.showFavoritesOnly) {
                finalResults = results.filter(p => AppState.favorites.includes(p.place_id));
            }
            
            if(finalResults.length > 0) {
                processResults(finalResults);
            } else {
                 uiStateEmpty();
            }
        } else {
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
            console.log("No results or error from Places API:", status);
        }
    });
}

function processResults(results) {
    // 1. Seřadíme výsledky podlé hodnocení sestupně
    // Místa bez hodnocení dáváme na konec 
    const sortedResults = results.sort((a, b) => {
        // Pokud mají stejné hodnocení, řadíme podle počtu recenzí
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        
        if (ratingB === ratingA) {
            return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
        }
        return ratingB - ratingA;
    });

    DOM.resultsList.innerHTML = ''; // Vyčištění
    DOM.resultsCount.textContent = `${sortedResults.length} nalezeno`;
    DOM.resultsCount.classList.remove('hidden');

    const bounds = new google.maps.LatLngBounds();

    sortedResults.forEach((place, index) => {
        // Vytvoření markeru na mapě s animací (staggering)
        setTimeout(() => {
            createMarker(place);
        }, index * 50); // Postupné poskakování markerů
        
        // Přidání do zobrazení hranic, aby se na konci udělal fitBounds
        if (place.geometry && place.geometry.location) {
            bounds.extend(place.geometry.location);
        }

        // Abychom získali odkaz na web (website), musíme zavolat Detail API (textSearch ho běžně plně nevrací)
        // Optimalizace: Vykreslíme kartu ihned a data o webu dočteme asynchronně po rozbalení, 
        // nebo v našem případě si vystačíme zatím rovnou s google maps URL, protože places Detail pro každý 
        // výsledek zvlášť by rychle vyčerpal API kvóty.
        // Google mapy URL vrací (place.url není vždy v textSearch, ale můžeme vytvořit link):
        const mapUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
        
        // Vykreslení karty v postranním panelu
        renderResultCard(place, mapUrl);
    });

    // Upravíme zoom mapy, aby obsáhl všechny markery pro tento dotaz
    if (sortedResults.length > 0 && !bounds.isEmpty()) {
        AppState.map.fitBounds(bounds);
        
        // Nenechat zoom být moc detailní (např. pokud je jen jeden výsledek)
        const listener = google.maps.event.addListener(AppState.map, "idle", function() { 
            if (AppState.map.getZoom() > 14) AppState.map.setZoom(14); 
            google.maps.event.removeListener(listener); 
        });
    }

    uiStateResults();
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

function renderResultCard(place, mapUrl) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = `place-${place.place_id}`;

    const isFav = AppState.favorites.includes(place.place_id);
    const favClass = isFav ? 'active' : '';
    const favIcon = isFav ? 'ph-fill' : 'ph';

    const rating = place.rating || 0;
    const ratingHtml = rating > 0 
        ? `<span>${rating.toFixed(1)}</span>
           <i class="ph-fill ph-star"></i>
           <span class="reviews-count">(${place.user_ratings_total || 0})</span>`
        : `<span style="color: var(--text-secondary); font-size: 0.8rem;">Bez hodnocení</span>`;

    card.innerHTML = `
        <div class="card-actions">
           <div class="rating">${ratingHtml}</div>
           <button class="btn-favorite ${favClass}" data-place-id="${place.place_id}" title="Přidat do oblíbených">
               <i class="${favIcon} ph-heart"></i>
           </button>
        </div>
        <div class="card-header">
            <h3>${place.name}</h3>
        </div>
        <p class="address">
            <i class="ph-fill ph-map-pin"></i> 
            ${place.formatted_address.replace(', Česká republika', '')}
        </p>
        <div style="display: flex; gap: 0.5rem;">
            <a href="${mapUrl}" target="_blank" class="btn-outline" style="flex: 1; padding: 0.4rem;">
                <i class="ph ph-map-trifold"></i> Otevřít na mapě
            </a>
            <button class="btn-outline get-website-btn" data-place-id="${place.place_id}" style="flex: 1; padding: 0.4rem;">
                <i class="ph ph-info"></i> Zobrazit detaily
            </button>
        </div>
        <div id="details-container-${place.place_id}"></div>
    `;

    // Event listener pro marker na mapě přes hover
    card.addEventListener('mouseenter', () => {
        const marker = AppState.markers.find(m => m.title === place.name);
        if(marker) marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => { if(marker) marker.setAnimation(null); }, 750);
    });

    // Event pro uložení/odebrání z oblíbených
    const favBtn = card.querySelector('.btn-favorite');
    favBtn.addEventListener('click', (e) => toggleFavorite(place.place_id, favBtn));

    // Event pro vytažení detailů (web, telefon, recenze) - Places Details API
    const detailBtn = card.querySelector('.get-website-btn');
    detailBtn.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const placeId = btn.getAttribute('data-place-id');
        const container = document.getElementById(`details-container-${placeId}`);
        
        btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Hledám detaily...`;
        btn.disabled = true;

        const request = {
            placeId: placeId,
            fields: ['website', 'formatted_phone_number', 'reviews']
        };

        AppState.placesService.getDetails(request, (detailPlace, status) => {
            btn.style.display = 'none'; // Schovat button, detaily zůstanou vypsané
            
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                let htmlContent = '<div class="place-details">';
                
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
                            <a href="${detailPlace.website}" target="_blank">Webové stránky firmy</a>
                        </div>
                    `;
                }

                // Nemá ani jedno?
                if (!detailPlace.formatted_phone_number && !detailPlace.website) {
                    htmlContent += `
                         <span style="color: var(--text-secondary); font-size: 0.85rem; display: block; text-align: center; padding: 0.5rem;">
                            <i class="ph ph-info"></i> Další kontaktní údaje nejsou k dispozici.
                        </span>
                    `;
                }

                // Recenze (Zobrazíme první nejrelevantnější, pokud existuje a má text)
                if (detailPlace.reviews && detailPlace.reviews.length > 0) {
                     const validReview = detailPlace.reviews.find(r => r.text && r.text.trim().length > 10);
                     if (validReview) {
                         const maxStars = 5;
                         const starIcons = Array.from({length: validReview.rating}, () => '<i class="ph-fill ph-star" style="color: var(--star-color);"></i>').join('');
                         
                         htmlContent += `
                            <div class="review-box">
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
                container.innerHTML = htmlContent;
            } else {
                container.innerHTML = `
                    <span style="color: var(--text-secondary); font-size: 0.85rem; display: block; text-align: center; padding: 0.5rem;">
                        <i class="ph ph-warning"></i> Nepodařilo se načíst detailnější informace.
                    </span>
                `;
            }
        });
    });

    DOM.resultsList.appendChild(card);
}

// ----- Oblíbené Funkce -----

function toggleFavorite(placeId, btnElement) {
    const isFav = AppState.favorites.includes(placeId);
    if(isFav) {
        // Odebrat
        AppState.favorites = AppState.favorites.filter(id => id !== placeId);
        btnElement.classList.remove('active');
        btnElement.querySelector('i').classList.replace('ph-fill', 'ph');
    } else {
        // Přidat
        AppState.favorites.push(placeId);
        btnElement.classList.add('active');
        btnElement.querySelector('i').classList.replace('ph', 'ph-fill');
        
        // Zvukový vizuál - malý bounce se zajistí CSS
    }
    
    // Uložit do cache prohlížeče
    localStorage.setItem('cz_locator_favorites', JSON.stringify(AppState.favorites));

    // Pokud je aktivní filtr, překreslíme
    if(AppState.showFavoritesOnly) {
         document.getElementById(`place-${placeId}`).style.display = 'none';
         
         if(AppState.favorites.length === 0) {
             uiStateEmpty();
         }
    }
}

function toggleFavoriteFilter() {
    AppState.showFavoritesOnly = !AppState.showFavoritesOnly;
    
    if(AppState.showFavoritesOnly) {
        DOM.btnFavoriteFilter.classList.add('active');
    } else {
        DOM.btnFavoriteFilter.classList.remove('active');
    }

    // Pokud uživatel už něco vyhledával, automaticky přefiltrujeme stávající výsledky z paměti
    // Abychom ušetřili API calls, jednoduše znovu zavoláme handleSearch kde aplikace zohlední filter status
    if (DOM.regionSelect.value && DOM.searchQuery.value) {
         handleSearch();
    }
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
