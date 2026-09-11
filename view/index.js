let isDarkMode = true;
let autoScrollInterval = null;

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
        const $btn = document.querySelector("#auto-scroll");
        if ($btn) {
            $btn.textContent = "▶▶ Auto";
            $btn.classList.add("is-light");
        }
    }
}

// Apply initial theme immediately (before any book is opened)
document.documentElement.setAttribute("data-theme", "dark");
let isContinuous = true;
let isTOCVisible = false;

// ─── Recent-books history helpers ────────────────────────────────────────────
const HISTORY_KEY = "recentBooks";
const HISTORY_MAX = 10;

function loadHistory(callback) {
    chrome.storage.local.get(HISTORY_KEY, (result) => {
        callback(result[HISTORY_KEY] || []);
    });
}

function saveHistory(history) {
    chrome.storage.local.set({ [HISTORY_KEY]: history });
}

/**
 * Upsert a book entry. If the name already exists it is moved to the front
 * and its lastChapter is updated; otherwise a new entry is prepended and the
 * list is capped at HISTORY_MAX.
 */
function recordBookOpen(name, lastChapter) {
    loadHistory((history) => {
        const idx = history.findIndex((b) => b.name === name);
        if (idx !== -1) {
            history.splice(idx, 1);
        }
        history.unshift({ name, lastChapter });
        if (history.length > HISTORY_MAX) {
            history.length = HISTORY_MAX;
        }
        saveHistory(history);
    });
}

function updateLastChapter(name, chapter) {
    loadHistory((history) => {
        const entry = history.find((b) => b.name === name);
        if (entry) {
            entry.lastChapter = chapter;
            saveHistory(history);
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────

function cleanReaderElement(rendition) {
    rendition.clear();
    rendition.destroy();
    document.querySelector("#reader").innerHTML = "";
}

function defineThemes(rendition) {
    // Themes
    rendition.themes.register("my-dark", "/lib/epubjs/themes.css");
    rendition.themes.register("light", "/lib/epubjs/themes.css");

    if (isDarkMode) {
        rendition.themes.select("my-dark");
    } else {
        rendition.themes.select("light");
    }

    rendition.themes.fontSize(document.querySelector("#font-size").value);
}

function displayReaderWithDefaultReadingMode(book, chapter = null) {
    const rendition = book.renderTo("reader", {
        flow: "scrolled-doc",
        width: "100%",
        height: "100%",
        overflow: "auto",
        allowScriptedContent: true,
    });

    const removePadding = () => {
        document.querySelector(".epub-container").style.paddingBottom = "unset";
        mapKeys();
    }

    let displayed;
    if (chapter != null) {
        displayed = rendition.display(chapter).then(removePadding);
    } else {
        displayed = rendition.display().then(removePadding);
    }

    return rendition;
}

function scrollToChapterId(anchorHref) {
    const elId = anchorHref.substr(anchorHref.indexOf("#"));
    const $el = document.querySelector(elId);
    if ($el) {
        $el.scrollIntoView(false);
        window.scrollY(-56);
    } else {
        window.scrollTo(0, 0);
    }
}

function addEventToTOCEl(rendition, el) {
    const $menuList = document.querySelector(".menu-list");

    el.addEventListener("click", e => {
        e.preventDefault();

        rendition.clear();

        rendition.display(el.dataset.href).then(() => {
            scrollToChapterId(el.dataset.href);
            mapKeys();
        });

        const $el = $menuList.querySelector(".is-active");
        if ($el) {
            $el.classList.remove("is-active");
        }

        el.classList.add("is-active");

        return false;
    });
}

function createAnchorTagsForChapters(rendition, parentEl, chapters, isNested = false) {
    chapters.forEach((chapter, idx) => {
        const $listItem = document.createElement("li");

        const $anchor = document.createElement("a");
        $anchor.textContent = chapter.label;
        $anchor.dataset.href = chapter.href;

        let lastIdx = chapter.href.indexOf('#');
        if (lastIdx == -1) {
            lastIdx = chapter.href.length;
        }
        $anchor.dataset.originalHref = chapter.href.substring(0, lastIdx);

        if (!isNested && idx == 0) {
            $anchor.classList.add("is-active");
        }

        addEventToTOCEl(rendition, $anchor);

        $listItem.append($anchor);

        parentEl.append($listItem);

        if (chapter.subitems.length) {
            $ul = document.createElement("ul");
            $listItem.appendChild($ul);
            createAnchorTagsForChapters(rendition, $ul, chapter.subitems, true);
        }
    });

}

function highlightNextOrPreviousChapter(newHref) {
    const $oldEl = document.querySelector(".menu-list .is-active");
    if ($oldEl) {
        $oldEl.classList.remove("is-active");
    }

    const $el = document.querySelector(".menu-list a[data-original-href='" + newHref + "']")
    if ($el) {
        $el.classList.add("is-active");
    }
}

function initEpubjs(file, startChapter = null) {
    const bookName = typeof file === "string" ? file : file.name;
    const book = ePub(file);

    // Start in continuous mode (isContinuous defaults to true)
    let rendition = book.renderTo("reader", {
        manager: "continuous",
        flow: "scrolled",
        width: "100%",
        height: "100%",
        overflow: "scroll",
        allowScriptedContent: true,
    });

    rendition.display(startChapter || undefined).then(() => {
        document.querySelector(".epub-container").style.paddingBottom = "50vh";
        mapKeys();
    });

    defineThemes(rendition);

    // Record the book and starting chapter in history
    recordBookOpen(bookName, startChapter);

    book.loaded.navigation.then((toc) => {
        // TOC
        const $menuList = document.querySelector(".menu-list");
        createAnchorTagsForChapters(rendition, $menuList, toc);

        // Toggle TOC
        document.querySelector("#toggle-toc").addEventListener("click", (e) => {
            e.preventDefault();

            if (isTOCVisible) {
                document.querySelector("#toc-menu").classList.add("is-0");
                document.querySelector("#reader-column").classList.remove("is-three-quarters");
            } else {
                document.querySelector("#toc-menu").classList.remove("is-0");
                document.querySelector("#reader-column").classList.add("is-three-quarters");
            }

            rendition.clear();
            let currentChapter = document.querySelector(".is-active");
            if (currentChapter) {
                currentChapter = currentChapter.dataset.href;
                rendition.display(currentChapter).then(mapKeys);
            } else {
                rendition.display().then(mapKeys);
            }


            isTOCVisible = ! isTOCVisible;

            return false;
        });

        // Dark Mode
        document.querySelector("#dark-mode-toggle").addEventListener("click", () => {
            if (isDarkMode) {
                rendition.themes.select("light");
                document.documentElement.removeAttribute("data-theme");
                document.querySelector("#dark-mode-toggle strong").textContent = "☀️";
            } else {
                rendition.themes.select("my-dark");
                document.documentElement.setAttribute("data-theme", "dark");
                document.querySelector("#dark-mode-toggle strong").textContent = "🌙";
            }

            isDarkMode = !isDarkMode;

            document.querySelector("iframe").focus();

            return false;
        });

        // Font Size
        document.querySelector("#font-size").addEventListener("blur", (e) => {
            rendition.themes.fontSize(e.target.value);
        });

        // Auto Scroll
        document.querySelector("#auto-scroll").addEventListener("click", () => {
            const $btn = document.querySelector("#auto-scroll");
            const $container = document.querySelector(".epub-container");

            if (autoScrollInterval) {
                // Deactivate
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
                $btn.textContent = "▶▶ Auto";
                $btn.classList.remove("is-info");
                $btn.classList.add("is-info", "is-light");
            } else {
                // Activate — read current field values
                const delay  = Math.max(10,  parseInt(document.querySelector("#scroll-delay").value)  || 4000);
                const amount = Math.max(1,   parseInt(document.querySelector("#scroll-amount").value) || 130);

                autoScrollInterval = setInterval(() => {
                    const container = document.querySelector(".epub-container");
                    if (container) container.scrollBy({top: amount, left: 0, behavior: 'smooth'});
                }, delay);

                $btn.textContent = "⏹ Stop";
                $btn.classList.remove("is-light");
            }
        });

        // Continuous Toggle
        document.querySelector("#continuous").addEventListener("click", (e) => {
            let currentChapter = document.querySelector(".is-active");
            if (currentChapter) {
                currentChapter = currentChapter.dataset.href;
            }

            stopAutoScroll();

            if (isContinuous) {
                cleanReaderElement(rendition);
                rendition = displayReaderWithDefaultReadingMode(book, currentChapter);

                e.target.innerText = "Continuous";
            } else {
                cleanReaderElement(rendition);

                rendition = book.renderTo("reader", {
                    manager: "continuous",
                    flow: "scrolled",
                    width: "100%",
                    height: "100%",
                    overflow: "scroll",
                    allowScriptedContent: true,
                });

                rendition.display().then(() => {
                    document.querySelector(".epub-container").style.paddingBottom = "50vh";
                    mapKeys();
                });

                e.target.innerText = "By Chapter";
            }

            defineThemes(rendition);

            isContinuous = ! isContinuous;

            return false;
        });

    });

    rendition.on("rendered", section => {
        // Auto-bookmark: persist the current chapter href whenever a section renders
        updateLastChapter(bookName, section.href);

        // Highlight the active TOC entry
        highlightNextOrPreviousChapter(section.href);

        // Next and Previous Buttons
        document.querySelector("#next-chapter").addEventListener("click", (e) => {
            e.preventDefault();

            const nextSection = section.next();

            if (nextSection) {
                rendition.display(nextSection.href).then(() => {
                    mapKeys();
                });

                highlightNextOrPreviousChapter(nextSection.href);
            }
            
            return false;
        });

        document.querySelector("#previous-chapter").addEventListener("click", (e) => {
            e.preventDefault();

            const prevSection = section.prev();

            if (prevSection) {
                rendition.display(prevSection.href).then(() => {
                    mapKeys();
                });

                highlightNextOrPreviousChapter(prevSection.href);
            }
            
            return false;
        });

        mapKeys();

    });

    rendition.hooks.render.register(() => mapKeys());
}

function renderReader() {
    document.querySelector("#main").innerHTML = `
        <nav class="navbar" role="navigation" aria-label="main navigation">
            <div class="navbar-brand">
                <img src="/icons/icon48.png" width="64" height="64">
            </div>
            <div id="navbarBasicExample" class="navbar-menu">
                <div class="navbar-start">
                    <a id="toggle-toc" class="navbar-item">
                        Toggle
                    </a>

                    <a id="continuous" class="navbar-item">
                        By Chapter
                    </a>

                    <input class="input" id="font-size" type="text" placeholder="Font Size" value="100%">
                    <input class="input" id="scroll-delay" type="number" placeholder="Delay (ms)" value="2000" min="10" style="width:7em;margin-left:4px;">
                    <input class="input" id="scroll-amount" type="number" placeholder="Scroll (px)" value="170" min="1" style="width:7em;margin-left:4px;">
                    <a id="auto-scroll" class="button is-info is-light" style="margin-left:4px;">
                        ▶▶ Auto
                    </a>
                </div>
            </div>

            <div class="navbar-end">
                <div class="navbar-item">
                    <div class="buttons">
                        <a id="previous-chapter" class="button is-secondary">
                            <strong>◀</strong>
                        </a>
                    </div>
                </div>
                <div class="navbar-item">
                    <div class="buttons">
                        <a id="next-chapter" class="button is-secondary">
                            <strong>▶</strong>
                        </a>
                    </div>
                </div>
                <div class="navbar-item">
                    <div class="buttons">
                        <a id="dark-mode-toggle" class="button is-primary">
                            <strong>🌙</strong>
                        </a>
                    </div>
                </div>
            </div>
        </nav>
    
        <div id="content" class="columns">
            <div id="toc-menu" class="column is-0">
                <aside class="menu">
                    <ul class="menu-list"></ul>
                </aside>
            </div>

            <div id="reader-column" class="column">
                <div id="reader"></div>
            </div>
        </div>
    `;
}

let gFlag = 0;
function mapKeys() {
    const $container = document.querySelector(".epub-container");

    document.querySelectorAll(".epub-view").forEach($epubView => {
        $epubView.addEventListener("DOMSubtreeModified", e => {
            mapKeys();
        });
    });

    document.querySelectorAll("iframe").forEach($iframe => {
        $iframe.contentDocument.onkeydown = e => {
            if (e.key == 'j') {
                $container.scrollBy(0, 100);
            } else if (e.key == 'k') {
                $container.scrollBy(0, -100);
            } else if (e.key == 'G') {
                $container.scrollTo(0, $container.scrollHeight);
            } else if (e.key == 'g') {
                gFlag++;
                if (gFlag == 2) {
                    gFlag = 0;
                    $container.scrollTo(0, 0);
                }
            }
        };

        $iframe.focus();
    });

}

// ─── Recent-books list on the initial page ───────────────────────────────────
function renderRecentBooks(history) {
    const $section = document.querySelector("#recent-books-section");
    if (!$section) return;

    // Clear any previous content
    $section.innerHTML = "";

    if (!history.length) return;

    $section.className = "columns is-centered";
    $section.style.marginTop = "1.5rem";

    const $col = document.createElement("div");
    $col.className = "column is-half";

    const $title = document.createElement("p");
    $title.className = "title is-5";
    $title.textContent = "Recently opened";
    $col.appendChild($title);

    const $list = document.createElement("ul");
    $list.className = "menu-list";

    history.forEach((entry) => {
        const $item = document.createElement("li");
        const $a = document.createElement("a");
        $a.textContent = entry.name;
        if (entry.lastChapter) {
            const $badge = document.createElement("span");
            $badge.className = "tag is-info is-light";
            $badge.style.marginLeft = "0.5rem";
            $badge.style.fontSize = "0.75em";
            $badge.textContent = entry.lastChapter.split("/").pop().replace(/\.x?html?$/i, "");
            $a.appendChild($badge);
        }
        $a.title = entry.lastChapter ? `Resume at: ${entry.lastChapter}` : entry.name;
        // Clicking a recent entry is informational only — the user still has
        // to pick the file via the file input because the browser cannot
        // re-open a local file without a new user gesture.  We store the
        // desired start chapter so that the change handler can use it.
        $a.dataset.lastChapter = entry.lastChapter || "";
        $a.dataset.bookName = entry.name;
        $a.addEventListener("click", (e) => {
            e.preventDefault();
            // Pre-fill the file-name span as a hint and trigger the picker
            document.querySelector(".file-name").textContent = entry.name;
            // Store the chapter to resume so the file-input handler can use it
            document.querySelector("#epub_file").dataset.resumeChapter = entry.lastChapter || "";
            document.querySelector("#epub_file").click();
        });
        $item.appendChild($a);
        $list.appendChild($item);
    });

    $col.appendChild($list);
    $section.appendChild($col);
}

// Populate recent list on load
loadHistory(renderRecentBooks);
// ─────────────────────────────────────────────────────────────────────────────

document.querySelector("#epub_file").addEventListener("change", (e) => {
    const fileEl = document.querySelector(".file-name");
    if (e.target.files[0]) {
        const name = e.target.files[0].name;
        fileEl.textContent = name;

        // Retrieve the resume chapter that was set when the user clicked a
        // recent-book entry (empty string means start from beginning)
        const resumeChapter = e.target.dataset.resumeChapter || null;
        // Clear so a subsequent manual open doesn't reuse it
        delete e.target.dataset.resumeChapter;

        stopAutoScroll();
        renderReader();
        initEpubjs(e.target.files[0], resumeChapter || null);

    } else {
        fileEl.textContent = "Please select a file!";
    }
});
