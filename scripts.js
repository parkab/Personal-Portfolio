document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.section');

    // Create mapping from section ID to nav link
    const sectionIdToNav = {};
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
            sectionIdToNav[href.substring(1)] = link;
        }
    });

    let currentActiveId = null;
    let isScrollingFromClick = false;

    // Function to update active nav link - ensures only one is active
    function updateActiveNav(activeId) {
        if (currentActiveId === activeId) return; // Prevent unnecessary updates
        
        currentActiveId = activeId;
        
        // Remove active from ALL nav links first
        navLinks.forEach(link => {
            link.classList.remove('active');
        });
        
        // Add active to the target nav link
        const targetNav = sectionIdToNav[activeId];
        if (targetNav) {
            targetNav.classList.add('active');
        }
    }

    // Smooth scrolling for navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                isScrollingFromClick = true;
                
                // Immediately update active state
                updateActiveNav(targetId);
                
                // Scroll to section
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
                
                // Reset the flag after a delay
                setTimeout(() => {
                    isScrollingFromClick = false;
                }, 800);
            }
        });
    });

    // Simple, reliable approach: use scroll position to determine active section
    function determineActiveSection() {
        if (isScrollingFromClick) return;
        
        const scrollPosition = window.scrollY + window.innerHeight * 0.3; // 30% from top of viewport
        
        let activeSection = sections[0]; // Default to first section
        
        // Find the section that should be active based on scroll position
        for (let i = sections.length - 1; i >= 0; i--) {
            const section = sections[i];
            if (scrollPosition >= section.offsetTop) {
                activeSection = section;
                break;
            }
        }
        
        const activeId = activeSection.getAttribute('id');
        updateActiveNav(activeId);
    }

    // Use scroll event instead of IntersectionObserver for more reliable mobile behavior
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(determineActiveSection, 10); // Very short debounce
    }, { passive: true });

    // Also check on page load
    determineActiveSection();

    // Handle visibility change (when switching tabs, etc.)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(determineActiveSection, 100);
        }
    });

    // Force update after any touch interaction on mobile
    let touchTimer = null;
    document.addEventListener('touchstart', () => {
        clearTimeout(touchTimer);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
            isScrollingFromClick = false;
            determineActiveSection();
        }, 150);
    }, { passive: true });

    // Add fade-in animation to body
    document.body.classList.add("fade-in");
});