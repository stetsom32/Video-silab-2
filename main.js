const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class RetroRacerReader {
    constructor() {
        // Defaults
        this.config = {
            wpm: 300,
            fontSize: 70,
            depth: 1200,
            lookAhead: 8,
            blurAmount: 5,
            originAngle: 0,
            particleCount: 50,
            skin: 'skin-synthwave',
            particleStyle: 'stars',
            fontFamily: "Outfit, sans-serif",
            currentIndex: 0,
            swayAmount: 100,
            swayType: 'dynamic',
            showSettings: true,
            fontColor: '#ffffff',
            effectColor: '#00d4ff',
            readingMode: 'word',
            variability: 0
        };

        this.words = [];
        this.isPlaying = false;
        this.particles = [];
        this.lastUpdateTime = 0;
        this.wordTimer = 0;
        this.currentWordDelay = null;
        this.globalTime = 0; // For sine wave motion
        
        // Cache DOM elements
        this.elements = {
            app: document.getElementById('app'),
            wordHolder: document.getElementById('word-holder'),
            playBtn: document.getElementById('play-btn'),
            resetBtn: document.getElementById('reset-btn'),
            wpmRange: document.getElementById('wpm-range'),
            wpmDisplay: document.getElementById('wpm-display'),
            fontRange: document.getElementById('font-size-range'),
            depthRange: document.getElementById('depth-range'),
            swayRange: document.getElementById('sway-range'),
            fileInput: document.getElementById('file-upload'),
            progressBar: document.getElementById('progress-bar'),
            currentIdx: document.getElementById('current-word-index'),
            totalIdx: document.getElementById('total-words'),
            grid: document.getElementById('grid'),
            skinSelector: document.getElementById('skin-selector'),
            lookaheadRange: document.getElementById('lookahead-range'),
            blurRange: document.getElementById('blur-range'),
            originAngleRange: document.getElementById('origin-angle-range'),
            particlesRange: document.getElementById('particles-range'),
            particlesHost: document.getElementById('particles-host'),
            fontSelector: document.getElementById('font-selector'),
            particleStyleSelector: document.getElementById('particle-style'),
            swayTypeSelector: document.getElementById('sway-type'),
            progressJump: document.getElementById('progress-jump'),
            positionManual: document.getElementById('position-manual'),
            toggleSettingsBtn: document.getElementById('toggle-settings-btn'),
            fontColorPicker: document.getElementById('font-color-picker'),
            effectColorPicker: document.getElementById('effect-color-picker'),
            readingModeSelector: document.getElementById('reading-mode'),
            variabilityRange: document.getElementById('variability-range'),
            pasteTextBtn: document.getElementById('paste-text-btn'),
            textInputContainer: document.getElementById('text-input-container'),
            textInput: document.getElementById('text-input'),
            applyTextBtn: document.getElementById('apply-text-btn'),
            cancelTextBtn: document.getElementById('cancel-text-btn')
        };

        this.loadSettings();
        this.init();
    }

    init() {
        // Event Listeners
        this.elements.playBtn.onclick = () => this.toggleReading();
        this.elements.resetBtn.onclick = () => this.reset();
        this.elements.wpmRange.oninput = (e) => this.updateSetting('wpm', e.target.value);
        this.elements.fontRange.oninput = (e) => this.updateSetting('fontSize', e.target.value);
        this.elements.depthRange.oninput = (e) => this.updateSetting('depth', e.target.value);
        this.elements.fileInput.onchange = (e) => this.handleFileUpload(e);
        this.elements.skinSelector.onchange = (e) => this.updateSetting('skin', e.target.value);
        this.elements.particlesRange.oninput = (e) => this.updateSetting('particleCount', e.target.value);
        this.elements.fontSelector.onchange = (e) => this.updateSetting('fontFamily', e.target.value);
        this.elements.particleStyleSelector.onchange = (e) => this.updateSetting('particleStyle', e.target.value);
        this.elements.swayRange.oninput = (e) => this.updateSetting('swayAmount', e.target.value);
        this.elements.swayTypeSelector.onchange = (e) => this.updateSetting('swayType', e.target.value);
        this.elements.lookaheadRange.oninput = (e) => this.updateSetting('lookAhead', e.target.value);
        this.elements.originAngleRange.oninput = (e) => this.updateSetting('originAngle', e.target.value);
        this.elements.blurRange.oninput = (e) => this.updateSetting('blurAmount', e.target.value);
        this.elements.toggleSettingsBtn.onclick = () => {
            this.config.showSettings = !this.config.showSettings;
            this.applySettings();
            this.saveSettings();
        };

        this.elements.fontColorPicker.oninput = (e) => this.updateSetting('fontColor', e.target.value);
        this.elements.effectColorPicker.oninput = (e) => this.updateSetting('effectColor', e.target.value);
        this.elements.variabilityRange.oninput = (e) => this.updateSetting('variability', e.target.value);

        // Text Paste Logic
        this.elements.pasteTextBtn.onclick = () => {
            this.elements.textInputContainer.style.display = 'flex';
            this.elements.textInput.focus();
        };

        this.elements.cancelTextBtn.onclick = () => {
            this.elements.textInputContainer.style.display = 'none';
        };

        this.elements.applyTextBtn.onclick = () => {
            const text = this.elements.textInput.value.trim();
            if (text) {
                this.setWords(text);
                this.elements.textInputContainer.style.display = 'none';
                this.elements.textInput.value = '';
            }
        };
        this.elements.readingModeSelector.onchange = (e) => {
            const oldMode = this.config.readingMode;
            this.config.readingMode = e.target.value;
            // If mode changes, we need to re-process the text to get syllables/words
            if (this.fullText) {
                this.setWords(this.fullText, false);
            }
            this.saveSettings();
        };
        
        // Jump Logic
        const handleJump = (e) => {
            if (this.words.length === 0) return;
            const percent = e.target.value / 100;
            this.currentIndex = Math.floor(this.words.length * percent);
            this.updateStats();
            this.renderQueue();
            this.saveSettings();
        };

        this.elements.progressJump.oninput = handleJump;
        this.elements.positionManual.oninput = handleJump;

        // Initial UI Apply
        this.applySettings();
        this.createParticles();

        // Start Animation Loop
        requestAnimationFrame((t) => this.update(t));
    }

    // Persistence
    loadSettings() {
        const savedConfig = localStorage.getItem('retro_racer_settings');
        if (savedConfig) {
            this.config = { ...this.config, ...JSON.parse(savedConfig) };
        }
        
        this.currentIndex = this.config.currentIndex || 0;

        const savedText = localStorage.getItem('retro_racer_text');
        if (savedText) {
            this.setWords(savedText, true);
        }
    }

    saveSettings() {
        this.config.currentIndex = this.currentIndex;
        localStorage.setItem('retro_racer_settings', JSON.stringify(this.config));
    }

    saveText(text) {
        try {
            localStorage.setItem('retro_racer_text', text);
        } catch (e) {
            console.warn("No se pudo guardar el texto en localStorage (posiblemente demasiado grande)");
        }
    }

    updateSetting(key, value) {
        this.config[key] = value;
        this.applySettings();
        if (key === 'particleCount' || key === 'particleStyle') {
            this.createParticles();
        }
        this.saveSettings();
    }

    applySettings() {
        // Apply to UI
        this.elements.wpmRange.value = this.config.wpm;
        this.elements.wpmDisplay.innerText = this.config.wpm;
        this.elements.fontRange.value = this.config.fontSize;
        this.elements.depthRange.value = this.config.depth;
        this.elements.lookaheadRange.value = this.config.lookAhead;
        this.elements.blurRange.value = this.config.blurAmount;
        this.elements.originAngleRange.value = this.config.originAngle;
        this.elements.swayRange.value = this.config.swayAmount;
        this.elements.particlesRange.value = this.config.particleCount;
        this.elements.skinSelector.value = this.config.skin;
        this.elements.swayTypeSelector.value = this.config.swayType;
        this.elements.fontSelector.value = this.config.fontFamily;
        this.elements.particleStyleSelector.value = this.config.particleStyle;
        this.elements.fontColorPicker.value = this.config.fontColor;
        this.elements.effectColorPicker.value = this.config.effectColor;
        if (this.elements.readingModeSelector) this.elements.readingModeSelector.value = this.config.readingMode;
        if (this.elements.variabilityRange) this.elements.variabilityRange.value = this.config.variability;

        // Apply to DOM
        document.documentElement.style.setProperty('--text-color', this.config.fontColor);
        document.documentElement.style.setProperty('--glow-color', this.config.effectColor);
        
        this.elements.app.className = 'app-container ' + this.config.skin;
        if (!this.config.showSettings) this.elements.app.classList.add('settings-collapsed');
        this.elements.toggleSettingsBtn.innerText = this.config.showSettings ? 'Ajustes ⚙' : 'Ajustes ⚙'; // Keeping same icon but toggle class is the key
        this.elements.toggleSettingsBtn.classList.toggle('btn-glow', this.config.showSettings);
        
        document.documentElement.style.setProperty('--font-size', `${this.config.fontSize}px`);
        document.documentElement.style.setProperty('--perspective', `${this.config.depth}px`);
        document.documentElement.style.setProperty('--font-hdr', this.config.fontFamily);
        
        // 3D Shadow enhancement for Bungee
        if (this.config.fontFamily.includes('Bungee')) {
            const c = this.config.fontColor;
            document.documentElement.style.setProperty('--text-3d-shadow', 
                `1px 1px ${c}, 2px 2px ${c}, 3px 3px ${c}, 4px 4px rgba(0,0,0,0.5)`);
        } else {
            document.documentElement.style.setProperty('--text-3d-shadow', 'none');
        }
        
        const duration = 2 / (this.config.wpm / 300);
        if (this.elements.grid) this.elements.grid.style.animationDuration = `${duration}s`;
        
        // When settings change we might need to re-render
        if (this.words && this.words.length > 0) this.renderQueue();
    }

    createParticles() {
        this.elements.particlesHost.innerHTML = '';
        this.particles = [];
        const count = this.config.particleCount;
        const style = this.config.particleStyle;

        for (let i = 0; i < count; i++) {
            const p = {
                el: document.createElement('div'),
                x: (Math.random() - 0.5) * 3000,
                y: (Math.random() - 0.5) * 3000,
                z: -Math.random() * 4000,
                speed: 5 + Math.random() * 20
            };
            p.el.classList.add('particle');
            
            // Style specific logic
            if (style === 'streaks') {
                p.el.style.width = '1px';
                p.el.style.height = '40px';
                p.el.style.borderRadius = '0';
            } else if (style === 'snow') {
                p.el.style.width = '4px';
                p.el.style.height = '4px';
                p.y = -2000; // Start high
            } else if (style === 'neon') {
                const colors = ['#00ffcc', '#ff007f', '#bc13fe', '#00d4ff'];
                p.el.style.background = colors[Math.floor(Math.random() * colors.length)];
                p.el.style.boxShadow = `0 0 10px ${p.el.style.background}`;
            }

            this.elements.particlesHost.appendChild(p.el);
            this.particles.push(p);
        }
    }

    animateParticles(deltaTime) {
        const speedMult = this.isPlaying ? (this.config.wpm / 150) : 0.2;
        const style = this.config.particleStyle;

        this.particles.forEach(p => {
            if (style === 'snow') {
                p.y += p.speed * 0.5;
                if (p.y > 1000) p.y = -1000;
            } else {
                p.z += p.speed * speedMult * (deltaTime / 16);
                if (p.z > 1000) p.z = -3000;
            }

            const opacity = Math.min(1, (p.z + 3000) / 1000);
            p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`;
            p.el.style.opacity = opacity;
        });
    }

    // Logic
    toggleReading() {
        if (this.words.length === 0) return;
        this.isPlaying = !this.isPlaying;
        this.elements.playBtn.innerText = this.isPlaying ? 'PAUSE' : 'PLAY';
        this.elements.app.classList.toggle('reading', this.isPlaying);
    }

    reset() {
        this.currentIndex = 0;
        this.isPlaying = false;
        this.elements.playBtn.innerText = 'PLAY';
        this.updateStats();
        this.renderQueue();
        this.saveSettings();
    }

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = async () => {
                const typedarray = new Uint8Array(reader.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let text = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(" ") + " ";
                }
                this.setWords(text);
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = () => this.setWords(reader.result);
            reader.readAsText(file);
        }
    }

    setWords(text, fromStorage = false) {
        this.fullText = text;
        const rawWords = text.split(/\s+/).filter(w => w.length > 0);
        
        if (this.config.readingMode === 'syllable') {
            this.words = [];
            rawWords.forEach(word => {
                const syllables = this.splitSpanishSyllables(word);
                this.words.push(...syllables);
            });
        } else if (this.config.readingMode === 'mixed') {
            this.words = [];
            rawWords.forEach(word => {
                if (word.length > 6) {
                    const syllables = this.splitSpanishSyllables(word);
                    this.words.push(...syllables);
                } else {
                    this.words.push(word);
                }
            });
        } else {
            this.words = rawWords;
        }
        
        // Recover last index if we're resuming
        if (fromStorage) {
            this.currentIndex = this.config.currentIndex || 0;
        } else {
            this.currentIndex = 0;
            this.saveText(text);
        }

        if (this.currentIndex >= this.words.length) this.currentIndex = 0;
        
        this.elements.totalIdx.innerText = this.words.length;
        this.updateStats();
        this.renderQueue();
        this.saveSettings();
    }

    startDemo() {
        this.setWords("¡Bienvenido de nuevo! He guardado tu configuración. Esta versión incluye nuevos tipos de letra, estilos de partículas como estelas de luz o nieve digital, y nuevos entornos como el Amanecer o el modo Matrix. Tu progreso se guardará automáticamente para que nunca pierdas el hilo de tu lectura. ¡Disfruta el viaje!");
    }

    updateStats() {
        this.elements.currentIdx.innerText = this.currentIndex;
        const progress = (this.currentIndex / this.words.length) * 100 || 0;
        this.elements.progressBar.style.width = `${progress}%`;
        
        // Sync sliders
        this.elements.progressJump.value = progress;
        this.elements.positionManual.value = progress;
    }

    update(time) {
        const deltaTime = time - this.lastUpdateTime;
        this.lastUpdateTime = time;
        this.globalTime += deltaTime;

        if (this.isPlaying && this.words.length > 0) {
            this.wordTimer += deltaTime;
            const baseMsPerWord = (60000 / this.config.wpm);
            
            // Variability logic: adds a random factor based on the variability setting
            // if variability is 20%, the actual speed can vary +/- 20%
            if (!this.currentWordDelay) {
               const varFactor = (parseFloat(this.config.variability) / 100);
               const randomShift = (Math.random() * 2 - 1) * varFactor;
               this.currentWordDelay = baseMsPerWord * (1 + randomShift);
            }

            if (this.wordTimer >= this.currentWordDelay) {
                this.wordTimer = 0;
                this.currentWordDelay = null; // Reset for next word
                this.currentIndex++;
                if (offset0_timer_hack === true) {} // ignore
                
                if (this.currentIndex >= this.words.length) {
                    this.currentIndex = this.words.length;
                    this.isPlaying = false;
                    this.elements.playBtn.innerText = 'PLAY';
                }
                this.updateStats();
                this.renderQueue();
                this.saveSettings(); // Save progress regularly
            }
        }

        this.animateParticles(deltaTime);
        this.animateWords();
        requestAnimationFrame((t) => this.update(t));
    }

    renderQueue() {
        this.elements.wordHolder.innerHTML = '';
        const lookAhead = parseInt(this.config.lookAhead);
        for (let i = 0; i < lookAhead; i++) {
            const idx = this.currentIndex + i;
            if (idx < this.words.length) {
                const wordEl = document.createElement('div');
                wordEl.classList.add('word-node');
                wordEl.innerText = this.words[idx];
                wordEl.dataset.offset = i;
                this.elements.wordHolder.appendChild(wordEl);
            }
        }
    }

    animateWords() {
        const wordEls = this.elements.wordHolder.querySelectorAll('.word-node');
        const msPerWord = (60000 / this.config.wpm);
        const progress = (this.wordTimer / msPerWord);
        const sway = parseFloat(this.config.swayAmount);
        const swayType = this.config.swayType;
        const originY = parseFloat(this.config.originAngle);
        
        // Intensity of high-speed vibration
        const vibration = this.isPlaying && this.config.wpm > 600 ? (this.config.wpm - 600) / 200 : 0;

        wordEls.forEach(el => {
            const offset = parseInt(el.dataset.offset);
            const relativeOffset = offset - (this.isPlaying ? progress : 0);
            const targetZ = -this.config.depth * relativeOffset * 0.5;
            const opacity = 1 - (Math.abs(relativeOffset) / 5);

            // Curve Logic
            let xOffset = 0;
            let rotationZ = 0;
            
            // Damping: The active word (relativeOffset close to 0) should be fixed in center
            // Future words (relativeOffset > 0) are the ones that sway/curve
            const dampener = Math.min(1.5, Math.pow(Math.abs(relativeOffset), 0.8));

            if (swayType === 'dynamic') {
                xOffset = Math.sin((this.globalTime / 1500) + (targetZ / 500)) * sway * dampener;
                rotationZ = Math.sin((this.globalTime / 1500) + (targetZ / 500)) * (sway / 10) * dampener;
            } else if (swayType === 'fixed') {
                xOffset = Math.sin(targetZ / 800) * sway * dampener;
                rotationZ = Math.sin(targetZ / 800) * (sway / 10) * dampener;
            } else if (swayType === 'straight') {
                xOffset = 0;
                rotationZ = 0;
            }

            // High Speed Vibration
            if (vibration > 0) {
                xOffset += (Math.random() - 0.5) * vibration;
                rotationZ += (Math.random() - 0.5) * vibration * 0.5;
            }

            const rotationX = (relativeOffset * 10); 
            
            // Vertical Origin Logic: word descends from above if originY is positive
            const yOffset = relativeOffset * (originY / 5);
            
            // Depth of Field (Blur) Logic: word clears as it approaches center
            const blurVal = Math.max(0, relativeOffset * (parseFloat(this.config.blurAmount) / 2));

            el.style.transform = `translate3d(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px), ${targetZ}px) rotateZ(${rotationZ}deg) rotateX(${rotationX}deg)`;
            el.style.filter = `blur(${blurVal}px)`;
            el.style.opacity = opacity;
            el.style.left = '50%';
            el.style.top = '50%';
            
            const glow = Math.max(0, 1 - Math.abs(relativeOffset)) * 15;
            el.style.textShadow = `0 0 ${glow}px var(--glow-color)`;
        });
    }

    // --- Syllable Splitting Logic for Spanish ---
    splitSpanishSyllables(word) {
        // Remove punctuation for syllable calculation but keep it for display
        const cleanWord = word.replace(/[^\wáéíóúüÁÉÍÓÚÜñÑ]/g, '');
        if (cleanWord.length <= 3) return [word];

        const vowels = "aeiouáéíóúüAEIOUÁÉÍÓÚÜ";
        const strongVowels = "aeoáéóAEOÁÉÓ";
        const weakVowels = "iuüIUÜ"; // Unaccented weak vowels for diphthongs
        const accentedWeakVowels = "íúÍÚ";

        const isVowel = (c) => vowels.includes(c);
        const isStrong = (c) => strongVowels.includes(c);
        const isWeak = (c) => weakVowels.includes(c);
        const isAccentedWeak = (c) => accentedWeakVowels.includes(c);

        let syllables = [];
        let currentPos = 0;
        let lastSplit = 0;

        while (currentPos < word.length) {
            // Find next vowel
            let vowelIdx = -1;
            for (let i = currentPos; i < word.length; i++) {
                if (isVowel(word[i])) {
                    vowelIdx = i;
                    break;
                }
            }

            if (vowelIdx === -1) break;

            // Basic RSVP syllable logic: we want to split after vowels
            // based on the number of consonants that follow.
            
            let nextVowelIdx = -1;
            for (let i = vowelIdx + 1; i < word.length; i++) {
                if (isVowel(word[i])) {
                    nextVowelIdx = i;
                    break;
                }
            }

            if (nextVowelIdx === -1) {
                // No more vowels, current syllable goes to end
                syllables.push(word.substring(lastSplit));
                lastSplit = word.length;
                break;
            }

            // Consonants between vowelIdx and nextVowelIdx
            let consonants = word.substring(vowelIdx + 1, nextVowelIdx);
            let splitAt = -1;

            // Rule: Handling Hiatus (Two strong vowels or accented weak + strong)
            if (consonants.length === 0) {
                const v1 = word[vowelIdx];
                const v2 = word[nextVowelIdx];
                if ((isStrong(v1) && isStrong(v2)) || (isAccentedWeak(v1) && isStrong(v2)) || (isStrong(v1) && isAccentedWeak(v2))) {
                    splitAt = vowelIdx + 1;
                } else {
                    // Diphthong or Triphthong
                    // Skip this vowel and look for the next split point
                    currentPos = nextVowelIdx;
                    continue;
                }
            } else if (consonants.length === 1) {
                // One consonant goes to the next syllable
                splitAt = vowelIdx + 1;
            } else if (consonants.length === 2) {
                // Inseparable groups
                const group = consonants.toLowerCase();
                const inseparable = ["bl", "cl", "gl", "fl", "pl", "br", "cr", "dr", "gr", "fr", "pr", "tr", "ch", "ll", "rr"];
                if (inseparable.includes(group)) {
                    splitAt = vowelIdx + 1;
                } else {
                    splitAt = vowelIdx + 2;
                }
            } else if (consonants.length >= 3) {
                // If last two are inseparable
                const lastTwo = consonants.substring(consonants.length - 2).toLowerCase();
                const inseparable = ["bl", "cl", "gl", "fl", "pl", "br", "cr", "dr", "gr", "fr", "pr", "tr", "ch", "ll", "rr"];
                if (inseparable.includes(lastTwo)) {
                    splitAt = vowelIdx + consonants.length - 1;
                } else {
                    splitAt = vowelIdx + consonants.length;
                }
            }

            if (splitAt !== -1) {
                syllables.push(word.substring(lastSplit, splitAt));
                lastSplit = splitAt;
                currentPos = splitAt;
            } else {
                currentPos = nextVowelIdx;
            }
        }

        if (lastSplit < word.length) {
            syllables.push(word.substring(lastSplit));
        }

        // Cleanup: some splits might be invalid if they don't have vowels
        // but our loop ensures vowel-based splits. 
        // RSVP specific: join very short syllables to previous one if needed
        // but for now let's keep it grammatical.

        return syllables.length > 0 ? syllables : [word];
    }
}

let offset0_timer_hack = false;
window.onload = () => new RetroRacerReader();
