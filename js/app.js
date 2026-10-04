const PAGE_ROUTES = {
    cooling: '/',
    purex: '/purex',
    pyroprocessing: '/pyroprocessing',
};

function pageIdForPath(pathname) {
    const match = Object.entries(PAGE_ROUTES).find(([, path]) => path === pathname);
    return match ? match[0] : 'cooling';
}

function navButtonFor(pageId) {
    return document.querySelector(`.nav-links button[data-page="${pageId}"]`);
}

function showPage(pageId, trigger, options = {}) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    const activeTrigger = trigger || navButtonFor(pageId);
    if (activeTrigger) {
        activeTrigger.parentElement
            .querySelectorAll('button')
            .forEach(button => button.classList.remove('active'));
        activeTrigger.classList.add('active');
    }

    const path = PAGE_ROUTES[pageId] || '/';
    if (!options.skipHistory && location.pathname !== path) {
        history.pushState({ pageId }, '', path);
    }
}

window.addEventListener('popstate', () => {
    showPage(pageIdForPath(location.pathname), null, { skipHistory: true });
});

showPage(pageIdForPath(location.pathname), null, { skipHistory: true });

document.querySelectorAll('.language-switcher button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.language-switcher button')
            .forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
    });
});
