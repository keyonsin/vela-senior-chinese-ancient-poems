import catalog from "../data/catalog.json"

export const sections = [
  { id: "original", title: "原文" },
  { id: "translation", title: "翻译" },
  { id: "notes", title: "注释" }
]

export function getBooks() {
  return catalog.map(book => ({
    id: book.id,
    title: book.title,
    count: book.count
  }))
}

export function getBook(id) {
  for (let index = 0; index < catalog.length; index++) {
    if (catalog[index].id === id) return catalog[index]
  }
  return null
}

export function getEntry(bookId, entryId) {
  const book = getBook(bookId)
  if (!book) return null
  for (let index = 0; index < book.entries.length; index++) {
    if (book.entries[index].id === entryId) return book.entries[index]
  }
  return null
}

export function getSection(id) {
  for (let index = 0; index < sections.length; index++) {
    if (sections[index].id === id) return sections[index]
  }
  return null
}
