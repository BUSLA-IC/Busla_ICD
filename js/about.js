let aboutData = null;
let allPeopleData = {};

function getField(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field.en || '';
}

function createPersonCard(person, type = 'large') {
    const name = getField(person.name);
    const title = getField(person.title);

    if (type === 'expert') {
        return `
            <div class="expert-card cursor-pointer" data-person-id="${person.id}">
                <div class="bg-b-surface border border-b-border rounded-2xl p-4 hover:border-b-primary hover:shadow-2xl hover:shadow-b-primary/20 transition-all h-full">
                    <img class="w-20 h-20 rounded-full mx-auto object-cover border-3 border-b-border group-hover:border-b-hl-light transition-all shadow-lg mb-3" src="${person.imageUrl}" alt="${name}">
                    <h3 class="font-bold text-sm text-white text-center line-clamp-2 mb-2">${name}</h3>
                    <p class="text-xs text-gray-400 text-center line-clamp-2">${title}</p>
                </div>
            </div>
        `;
    }

    return `
        <div class="card-hover cursor-pointer" data-person-id="${person.id}">
            <div class="gradient-border rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl h-full">
                <div class="bg-b-surface p-8 text-center h-full flex flex-col">
                    <div class="relative inline-block mx-auto mb-6">
                        <img class="w-32 h-32 rounded-full object-cover border-4 border-b-border hover:border-b-hl-light transition-all shadow-lg" src="${person.imageUrl}" alt="${name}">
                        <div class="absolute -bottom-2 -right-2 w-10 h-10 bg-b-primary rounded-full flex items-center justify-center border-4 border-b-surface">
                            <i data-feather="check" class="w-5 h-5 text-white"></i>
                        </div>
                    </div>
                    <h3 class="font-bold text-xl mb-2 text-white">${name}</h3>
                    <p class="text-sm text-b-hl-light mb-4 flex-grow">${title}</p>
                    <div class="mt-auto">
                        <span class="inline-flex items-center gap-2 text-sm text-b-primary hover:text-b-hl-light transition-colors bg-b-bg px-4 py-2 rounded-full">
                            <span>View Details</span>
                            <i data-feather="arrow-right" class="w-4 h-4"></i>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateModal(person) {
    const name = getField(person.name);
    const title = getField(person.title);
    const bio = getField(person.bio);
    const role = getField(person.role);

    const socialsHtml = person.socials && person.socials.length > 0
        ? '<div class="flex flex-wrap gap-3 justify-center mt-8">' +
          person.socials.map(social => `
            <a href="${social.url}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 bg-gradient-to-r from-b-primary to-b-hl-light text-white py-3 px-6 rounded-xl font-semibold hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                <i data-feather="external-link" class="w-4 h-4"></i>
                ${social.name}
            </a>
          `).join('') +
          '</div>'
        : '';

    document.getElementById('modal-body').innerHTML = `
        <div class="relative">
            <div class="flex justify-center mb-8">
                <div class="relative">
                    <img class="w-40 h-40 rounded-full object-cover border-4 border-b-primary shadow-2xl" src="${person.imageUrl}" alt="${name}">
                    <div class="absolute -bottom-3 -right-3 w-12 h-12 bg-gradient-to-br from-b-primary to-b-hl-light rounded-full flex items-center justify-center border-4 border-b-surface shadow-xl">
                        <i data-feather="star" class="w-6 h-6 text-white"></i>
                    </div>
                </div>
            </div>

            <h2 class="text-4xl font-bold text-center mb-3 gradient-text">${name}</h2>
            <p class="text-xl text-center text-b-hl-light mb-8 font-semibold">${title}</p>

            <div class="space-y-6">
                <div class="gradient-border rounded-2xl p-1">
                    <div class="bg-b-bg rounded-2xl p-6">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="w-10 h-10 bg-b-hl-green bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                                <i data-feather="user" class="w-5 h-5 text-b-hl-green"></i>
                            </div>
                            <div class="flex-grow text-left">
                                <strong class="text-b-hl-green text-lg block mb-2">Bio:</strong>
                                <p class="text-gray-300 leading-relaxed">${bio}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="gradient-border rounded-2xl p-1">
                    <div class="bg-b-bg rounded-2xl p-6">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="w-10 h-10 bg-b-hl-yellow bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                                <i data-feather="briefcase" class="w-5 h-5 text-b-hl-yellow"></i>
                            </div>
                            <div class="flex-grow text-left">
                                <strong class="text-b-hl-yellow text-lg block mb-2">Role in ZDC:</strong>
                                <p class="text-gray-300 leading-relaxed">${role}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${socialsHtml}
        </div>
    `;

    feather.replace();
}

function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        overlay.classList.add('opacity-100');
        content.classList.add('scale-100');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.remove('opacity-100');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        document.body.style.overflow = '';
        document.getElementById('modal-body').innerHTML = '';
    }, 300);
}

function renderAllSections() {
    if (aboutData.creator && aboutData.creator.length > 0) {
        document.getElementById('creator-container').innerHTML =
            aboutData.creator.map(person => createPersonCard(person, 'large')).join('');
    }

    const allContributors = [...(aboutData.mainContributor || []), ...(aboutData.contributors || [])];
    if (allContributors.length > 0) {
        document.getElementById('contributors-container').innerHTML =
            allContributors.map(person => createPersonCard(person, 'large')).join('');
    }

    if (aboutData.experts && aboutData.experts.length > 0) {
        document.getElementById('experts-container').innerHTML =
            aboutData.experts.map(person => createPersonCard(person, 'expert')).join('');
    }

    feather.replace();

    document.querySelectorAll('[data-person-id]').forEach(card => {
        card.addEventListener('click', () => {
            const personId = card.dataset.personId;
            const personData = allPeopleData[personId];
            if (personData) {
                populateModal(personData);
                openModal();
            }
        });
    });
}

async function initPage() {
    try {
        const response = await fetch('../data/about_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        aboutData = await response.json();

        allPeopleData = {
            ...(aboutData.creator || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...(aboutData.mainContributor || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...(aboutData.contributors || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...(aboutData.experts || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
        };

        renderAllSections();
    } catch (error) {
        console.error('Failed to fetch about data:', error);
    }
}

function initMobileMenu() {
    const menuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');

    if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            iconOpen.classList.toggle('hidden');
            iconClose.classList.toggle('hidden');
        });
    }
}

document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initPage();
    document.getElementById('current-year').textContent = new Date().getFullYear();
    feather.replace();
});