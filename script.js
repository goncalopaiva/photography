const gallery = document.querySelector('.gallery');
const modal = document.getElementById('photoModal');
const modalImage = document.getElementById('modalImage');
const modalCamera = document.getElementById('modalCamera');
const modalDate = document.getElementById('modalDate');
const modalExposure = document.getElementById('modalExposure');
const modalClose = document.getElementById('modalClose');
const navPrev = document.getElementById('navPrev');
const navNext = document.getElementById('navNext');

let currentCardIndex = -1;

function getCards() {
    return Array.from(gallery.querySelectorAll('.photo-card'));
}

function openModal(card) {
    const cards = getCards();
    currentCardIndex = cards.indexOf(card);

    modalImage.src = card.dataset.src;
    modalImage.alt = card.dataset.title;
    modalCamera.textContent = card.dataset.camera;
    modalDate.textContent = card.dataset.date;
    modalExposure.textContent = `${card.dataset.lens} ${card.dataset.aperture} ${card.dataset.shutter} ISO ${card.dataset.iso}`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalClose.focus();
}

function nextPhoto() {
    const cards = getCards();
    if (cards.length === 0) return;
    currentCardIndex = (currentCardIndex + 1) % cards.length;
    openModal(cards[currentCardIndex]);
}

function prevPhoto() {
    const cards = getCards();
    if (cards.length === 0) return;
    currentCardIndex = (currentCardIndex - 1 + cards.length) % cards.length;
    openModal(cards[currentCardIndex]);
}

function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalImage.src = '';
}

function bindGallery() {
    getCards().forEach((card) => {
        card.addEventListener('click', () => openModal(card));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openModal(card);
            }
        });
    });
}

modalClose.addEventListener('click', closeModal);
navPrev.addEventListener('click', prevPhoto);
navNext.addEventListener('click', nextPhoto);
modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
    } else if (event.key === 'ArrowLeft' && modal.classList.contains('open')) {
        prevPhoto();
    } else if (event.key === 'ArrowRight' && modal.classList.contains('open')) {
        nextPhoto();
    }
});

bindGallery();
