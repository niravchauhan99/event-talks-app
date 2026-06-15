/**
 * BigQuery Release Pulse - Client-Side Controller
 */

// Application State
const state = {
    notes: [],
    filteredNotes: [],
    activeFilter: 'all',
    searchQuery: '',
    selectedNote: null
};

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    statusDot: document.querySelector('.status-dot'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterBadgesContainer: document.getElementById('filter-badges-container'),
    notesTimeline: document.getElementById('notes-timeline'),
    skeletonLoader: document.getElementById('skeleton-loader'),
    emptyState: document.getElementById('empty-state'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    
    // Tweet Modal Elements
    tweetModalOverlay: document.getElementById('tweet-modal-overlay'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    charProgress: document.getElementById('char-progress'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalTweetBtn: document.getElementById('modal-tweet-btn'),
    
    // Toast Container
    toastContainer: document.getElementById('toast-container')
};

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes();
    
    // Refresh button
    elements.refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Search input interactions
    elements.searchInput.addEventListener('input', handleSearch);
    elements.clearSearchBtn.addEventListener('click', clearSearch);
    
    // Filter badges
    elements.filterBadgesContainer.addEventListener('click', handleFilterClick);
    
    // Reset filters button in empty state
    elements.resetFiltersBtn.addEventListener('click', resetAllFilters);
    
    // Modal controls
    elements.modalCancelBtn.addEventListener('click', closeTweetModal);
    elements.modalCloseBtn.addEventListener('click', closeTweetModal);
    elements.modalTweetBtn.addEventListener('click', publishTweet);
    elements.tweetTextarea.addEventListener('input', updateTweetCounter);
    
    // Close modal when clicking overlay
    elements.tweetModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.tweetModalOverlay) {
            closeTweetModal();
        }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.tweetModalOverlay.classList.contains('open')) {
            closeTweetModal();
        }
    });
});

/**
 * Fetch release notes from backend API
 * @param {boolean} force - Force refresh by bypassing cache
 */
async function fetchReleaseNotes(force = false) {
    setLoadingState(true);
    
    try {
        const url = `/api/release-notes${force ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        state.notes = data.notes || [];
        
        // Update stats and UI
        updateFilterCounts();
        applyFiltersAndSearch();
        
        // Update status text
        if (data.cached_at) {
            const date = new Date(data.cached_at * 1000);
            const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            elements.lastUpdatedText.textContent = `Last sync: ${formattedTime}`;
        }
        
        if (data.error) {
            showToast(data.error, 'error');
        } else if (force) {
            showToast('Release notes successfully refreshed!', 'success');
        }
        
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showToast('Failed to retrieve release notes. Please try again.', 'error');
        elements.lastUpdatedText.textContent = 'Sync failed';
    } finally {
        setLoadingState(false);
    }
}

/**
 * Set loading UI states (spinners, skeletons, dots)
 * @param {boolean} isLoading 
 */
function setLoadingState(isLoading) {
    if (isLoading) {
        elements.refreshIcon.classList.add('spin');
        elements.refreshBtn.disabled = true;
        elements.statusDot.classList.add('loading');
        elements.notesTimeline.innerHTML = '';
        elements.notesTimeline.appendChild(elements.skeletonLoader);
        elements.skeletonLoader.style.display = 'block';
        elements.emptyState.style.display = 'none';
    } else {
        elements.refreshIcon.classList.remove('spin');
        elements.refreshBtn.disabled = false;
        elements.statusDot.classList.remove('loading');
        elements.skeletonLoader.style.display = 'none';
    }
}

/**
 * Update the counts next to the filter badge labels
 */
function updateFilterCounts() {
    const counts = {
        all: state.notes.length,
        Feature: 0,
        Changed: 0,
        Deprecated: 0,
        Resolved: 0,
        General: 0
    };
    
    state.notes.forEach(note => {
        if (counts[note.type] !== undefined) {
            counts[note.type]++;
        } else {
            counts['General']++; // Fallback for other custom types
        }
    });
    
    // Set counts in UI
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-feature').textContent = counts.Feature;
    document.getElementById('count-changed').textContent = counts.Changed;
    document.getElementById('count-deprecated').textContent = counts.Deprecated;
    document.getElementById('count-resolved').textContent = counts.Resolved;
    document.getElementById('count-general').textContent = counts.General;
}

/**
 * Click handler for filter badges
 */
function handleFilterClick(e) {
    const badge = e.target.closest('.badge');
    if (!badge) return;
    
    // Toggle active state
    elements.filterBadgesContainer.querySelectorAll('.badge').forEach(b => b.classList.remove('active'));
    badge.classList.add('active');
    
    state.activeFilter = badge.dataset.filter;
    applyFiltersAndSearch();
}

/**
 * Search input handler
 */
function handleSearch(e) {
    state.searchQuery = e.target.value.toLowerCase().trim();
    
    // Toggle clear button visibility
    if (state.searchQuery.length > 0) {
        elements.clearSearchBtn.style.display = 'flex';
    } else {
        elements.clearSearchBtn.style.display = 'none';
    }
    
    applyFiltersAndSearch();
}

/**
 * Clear search input
 */
function clearSearch() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.style.display = 'none';
    applyFiltersAndSearch();
}

/**
 * Reset all filters to default
 */
function resetAllFilters() {
    clearSearch();
    elements.filterBadgesContainer.querySelectorAll('.badge').forEach(b => b.classList.remove('active'));
    document.getElementById('filter-all').classList.add('active');
    state.activeFilter = 'all';
    applyFiltersAndSearch();
}

/**
 * Apply both active filters and search terms to the dataset and update UI
 */
function applyFiltersAndSearch() {
    // 1. Filter by category
    let results = state.notes;
    if (state.activeFilter !== 'all') {
        results = results.filter(note => note.type === state.activeFilter);
    }
    
    // 2. Filter by search query
    if (state.searchQuery) {
        results = results.filter(note => {
            return note.description_text.toLowerCase().includes(state.searchQuery) || 
                   note.type.toLowerCase().includes(state.searchQuery) ||
                   note.date.toLowerCase().includes(state.searchQuery);
        });
    }
    
    state.filteredNotes = results;
    renderNotes();
}

/**
 * Render grouped cards into the timeline DOM
 */
function renderNotes() {
    // Clear existing content (except skeleton loader which is hidden anyway)
    elements.notesTimeline.innerHTML = '';
    
    if (state.filteredNotes.length === 0) {
        elements.emptyState.style.display = 'flex';
        return;
    }
    
    elements.emptyState.style.display = 'none';
    
    // Group updates by date
    const grouped = {};
    state.filteredNotes.forEach(note => {
        if (!grouped[note.date]) {
            grouped[note.date] = [];
        }
        grouped[note.date].push(note);
    });
    
    // Render groups chronologically
    for (const [date, items] of Object.entries(grouped)) {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        // Date Header
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        
        const dot = document.createElement('div');
        dot.className = 'date-dot';
        
        const title = document.createElement('h2');
        title.textContent = date;
        
        dateHeader.appendChild(dot);
        dateHeader.appendChild(title);
        dateGroup.appendChild(dateHeader);
        
        // Cards under this date
        items.forEach(note => {
            const card = document.createElement('article');
            card.className = 'update-card';
            card.dataset.id = note.id;
            
            // Map types to proper colors
            const typeClass = note.type.toLowerCase();
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="type-tag ${typeClass}">${note.type}</span>
                </div>
                <div class="card-body">
                    ${note.content_html}
                </div>
                <div class="card-footer">
                    <button class="btn-card-tweet" onclick="openTweetComposer('${note.id}')" title="Draft a tweet about this update">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>Tweet Update</span>
                    </button>
                </div>
            `;
            
            dateGroup.appendChild(card);
        });
        
        elements.notesTimeline.appendChild(dateGroup);
    }
}

/**
 * Open Tweet Composer Modal pre-filled with update text
 * @param {string} noteId 
 */
window.openTweetComposer = function(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    
    state.selectedNote = note;
    
    // Construct initial tweet text
    // Example: "BigQuery Update [June 15, 2026]: Use Gemini Cloud Assist to analyze SQL queries GA! #BigQuery #GoogleCloud"
    const maxDescLength = 180;
    let desc = note.description_text;
    if (desc.length > maxDescLength) {
        desc = desc.substring(0, maxDescLength).trim() + '...';
    }
    
    const tweetText = `BigQuery Update [${note.date}]: ${desc} #BigQuery #GoogleCloud`;
    
    elements.tweetTextarea.value = tweetText;
    updateTweetCounter();
    
    // Show Modal
    elements.tweetModalOverlay.classList.add('open');
    elements.tweetTextarea.focus();
    
    // Disable main body scroll
    document.body.style.overflow = 'hidden';
};

/**
 * Close Tweet Composer Modal
 */
function closeTweetModal() {
    elements.tweetModalOverlay.classList.remove('open');
    state.selectedNote = null;
    document.body.style.overflow = '';
}

/**
 * Update Tweet character count UI and validate lengths
 */
function updateTweetCounter() {
    const text = elements.tweetTextarea.value;
    const length = text.length;
    
    elements.charCount.textContent = length;
    
    // Update progress bar
    const percentage = Math.min((length / 280) * 100, 100);
    elements.charProgress.style.width = `${percentage}%`;
    
    // Add warnings based on limits
    elements.charCount.classList.remove('warning', 'danger');
    elements.charProgress.classList.remove('warning', 'danger');
    elements.modalTweetBtn.disabled = false;
    
    if (length > 280) {
        elements.charCount.classList.add('danger');
        elements.charProgress.classList.add('danger');
        elements.modalTweetBtn.disabled = true;
    } else if (length > 240) {
        elements.charCount.classList.add('warning');
        elements.charProgress.classList.add('warning');
    }
    
    if (length === 0) {
        elements.modalTweetBtn.disabled = true;
    }
}

/**
 * Open Twitter Web Intent URL with custom tweet content
 */
function publishTweet() {
    const text = elements.tweetTextarea.value;
    if (!text || text.length > 280) return;
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    
    closeTweetModal();
    showToast('Redirected to X to publish your tweet!', 'success');
}

/**
 * Display customized Toast Notifications
 * @param {string} message 
 * @param {'success'|'error'|'info'} type 
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Trigger animation frame to show toast
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Remove toast after duration
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 4000);
}
