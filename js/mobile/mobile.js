document.addEventListener('DOMContentLoaded', function () {
    const dmsButton = document.querySelector('#dms_button');
    const sidebar = document.querySelector('#sidebar');
    const overlay = document.querySelector('#sidebar-overlay');

    function toggleSidebar(show) {
        if (show) {
            sidebar.classList.add('show');
            overlay.classList.add('active');
        } else {
            sidebar.classList.remove('show');
            overlay.classList.remove('active');
        }
    }

    // Toggle sidebar on DMs button click
    dmsButton?.addEventListener('click', function (e) {
        e.preventDefault();
        const isVisible = sidebar.classList.contains('show');
        toggleSidebar(!isVisible);
    });

    // Hide sidebar when clicking outside it
    overlay?.addEventListener('click', () => {
        toggleSidebar(false);
    });
});
