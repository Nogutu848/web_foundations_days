// Notes Toolkit - Day 3

let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const VALID_CATEGORIES = ["personal", "work", "study"];

// Normalise text: trim, collapse repeated spaces, lower-case.
function normalise(text) {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

// 1. Notes whose text contains word (case-insensitive).
function searchNotes(word) {
  const term = String(word).trim().toLowerCase();
  if (term === "") {
    return [];
  }
  return notes.filter(function (note) {
    return note.text.toLowerCase().includes(term);
  });
}

// 2. Note with the most characters, or null if there are none.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Count of notes per category.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category] === undefined) {
      counts[note.category] = 0;
    }
    counts[note.category]++;
  }
  return counts;
}

// 4. Sentence summary, e.g. "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const total = notes.length;
  const noun = total === 1 ? "note" : "notes";
  if (total === 0) {
    return `0 ${noun}.`;
  }
  const counts = countByCategory();
  const parts = [];
  for (const category of VALID_CATEGORIES) {
    if (counts[category]) {
      parts.push(`${counts[category]} ${category}`);
    }
  }
  return `${total} ${noun}: ${parts.join(", ")}.`;
}

// 5. True if a note with the same text exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some(function (note) {
    return normalise(note.text) === target;
  });
}

// 6. Add a note if valid. Returns true when added, false otherwise.
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Rejected: text must be a string.");
    return false;
  }
  const cleaned = text.trim();
  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Rejected: text must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Rejected: a note with this text already exists.");
    return false;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    console.log("Rejected: category must be personal, work or study.");
    return false;
  }
  const nextId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  return true;
}

// ---------------------------------------------------------------
// Tests (expected output in the comment beside each call)
// ---------------------------------------------------------------

// searchNotes
console.log(searchNotes("MILK"));   // [ { id: 1, text: "Buy milk and bread", category: "personal" } ]
console.log(searchNotes("the"));    // 2 notes: id 2 ("Finish the Day 3 assignment") and id 3 ("Email the project report to Grace")
console.log(searchNotes("zebra"));  // []
console.log(searchNotes(""));       // []

// longestNote
console.log(longestNote());         // { id: 3, text: "Email the project report to Grace", category: "work" }

// countByCategory
console.log(countByCategory());     // { personal: 2, study: 2, work: 1 }

// getSummary
console.log(getSummary());          // "5 notes: 2 personal, 1 work, 2 study."

// isDuplicate
console.log(isDuplicate("  BUY   Milk and bread ")); // true
console.log(isDuplicate("Buy eggs"));                // false

// addNote
console.log(addNote("Plan weekend trip", "personal")); // true
console.log(getSummary());                             // "6 notes: 3 personal, 1 work, 2 study."
console.log(addNote("buy MILK and bread", "personal")); // Rejected: a note with this text already exists. / false
console.log(addNote("Water the plants", "hobby"));      // Rejected: category must be personal, work or study. / false
console.log(addNote("", "work"));                       // Rejected: text must be 1-200 characters. / false
console.log(addNote("a".repeat(201), "work"));          // Rejected: text must be 1-200 characters. / false
console.log(addNote("a".repeat(200), "work"));          // true (exactly 200 characters is allowed)

// Edge cases with empty and single-note arrays
const backup = notes;
notes = [];
console.log(longestNote());   // null
console.log(getSummary());    // "0 notes."
console.log(countByCategory()); // {}
notes = [backup[0]];
console.log(getSummary());    // "1 note: 1 personal."
notes = backup;               // restore the original data
