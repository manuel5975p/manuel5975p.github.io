document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const progress = document.querySelector('.progress-bar');
    let currentSlide = 0;

    function updateSlides() {
        slides.forEach((slide, index) => {
            slide.classList.remove('active', 'prev');
            if (index === currentSlide) {
                slide.classList.add('active');
            } else if (index < currentSlide) {
                slide.classList.add('prev');
            }
        });
        
        // Update Progress Bar
        const percentage = ((currentSlide + 1) / slides.length) * 100;
        progress.style.width = `${percentage}%`;

        // Update Buttons
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === slides.length - 1;
        prevBtn.style.opacity = currentSlide === 0 ? '0.5' : '1';
        nextBtn.style.opacity = currentSlide === slides.length - 1 ? '0.5' : '1';
    }

    function nextSlide() {
        if (currentSlide < slides.length - 1) {
            currentSlide++;
            updateSlides();
        }
    }

    function prevSlide() {
        if (currentSlide > 0) {
            currentSlide--;
            updateSlides();
        }
    }

    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Space') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
    });

    // --- Robust Syntax Highlighter ---
    // 1. Escapes HTML.
    // 2. Extracts Comments and Strings (to avoid matching keywords inside them).
    // 3. Highlights Keywords/Types/Funcs in the remaining code.
    // 4. Re-inserts the styled Comments and Strings.

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    document.querySelectorAll('code.cpp').forEach(block => {
        let code = block.innerText; // Get raw text
        code = escapeHtml(code);

        const placeholders = [];
        const pushPlaceholder = (str, type) => {
            placeholders.push(`<span class="${type}">${str}</span>`);
            return `###PH${placeholders.length - 1}###`;
        };

        // 1. extracted comments and strings
        // Regex matches:
        // Group 1: Comments (// ...)
        // Group 2: Strings ("...") -> in escaped form: &quot;...&quot;
        // Note: We use "[\s\S]" for dot in comments if we supported multiline, but here assume single line //
        code = code.replace(/(\/\/.*)|(&quot;.*?&quot;)/g, (match, com, str) => {
            if (com) return pushPlaceholder(com, 'com');
            if (str) return pushPlaceholder(str, 'str');
            return match;
        });

        // 2. Highlight Keywords, Types, etc.
        const keywords = /\b(using|template|typename|struct|public|if|else|return|const|auto|static|void|int|double|float|bool|class)\b/g;
        const types = /\b(StateVec|Scalar|ScalarType|Validator|SINSValidator|Eigen|Matrix|ValidationResult|std|optional|Iterator|FusionRunner|EKF|ValidatorT)\b/g;
        const functions = /\b(validateState|beforeIterator|value|has_value|Zero|unwrap)\b/g;
        const numbers = /\b\d+(\.\d+)?[f]?\b/g;

        // Apply highlighting to the code (which now contains ###PH### placeholders, safe from matching)
        code = code.replace(keywords, '<span class="kwd">$1</span>');
        code = code.replace(types, '<span class="type">$1</span>');
        code = code.replace(functions, '<span class="func">$1</span>');
        code = code.replace(numbers, '<span class="num">$1</span>');

        // 3. Restore placeholders
        // We do this in a loop because we want to replace exact matches
        placeholders.forEach((html, i) => {
            code = code.replace(`###PH${i}###`, html);
        });

        block.innerHTML = code;
    });

    updateSlides();
});
