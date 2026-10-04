const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

function updateCounts() {
    const text = noteText.value;
    const characterCount = text.length;

    const words = text.trim() === ""
        ? 0
        : text.trim().split(/\s+/).length;

    charCount.textContent = `${characterCount} / 200 characters`;
    wordCount.textContent = `${words} words`;

    charCount.classList.remove("warning", "over");

    if (characterCount > 200) {
        charCount.classList.add("over");
    } else if (characterCount > 180) {
        charCount.classList.add("warning");
    }
}

function saveDraft() {
    localStorage.setItem("noteDraft", noteText.value);
}

function clearEverything() {
    noteText.value = "";
    updateCounts();
    localStorage.removeItem("noteDraft");
}

noteText.addEventListener("input", () => {
    updateCounts();
    saveDraft();
});

clearBtn.addEventListener("click", () => {
    clearEverything();
});

noteText.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        clearEverything();
    }
});

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    themeToggle.textContent = isDark ? "Light mode" : "Dark mode";

    localStorage.setItem("theme", isDark ? "dark" : "light");
});

const savedDraft = localStorage.getItem("noteDraft");

if (savedDraft !== null) {
    noteText.value = savedDraft;
}

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
} else {
    themeToggle.textContent = "Dark mode";
}

updateCounts();
