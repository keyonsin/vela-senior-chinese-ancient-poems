import router from "@system.router"

export function openPage(page, uri, params) {
  if (page.navigating || Date.now() < (page.ignoreTapUntil || 0)) return
  page.navigating = true
  router.push({ uri, params })
}

export function goBack(page) {
  if (page.navigating) return
  page.navigating = true
  router.back()
}

export function swipeBack(page, event) {
  if (!event) return
  page.ignoreTapUntil = Date.now() + 350
  if (event.direction === "right") goBack(page)
}

function pointFrom(event, key) {
  const points = event && event[key]
  if (!points || points.length !== 1) return null
  const point = points[0]
  if (typeof point.clientX !== "number" || typeof point.clientY !== "number") return null
  return point
}

// Unlike swipe, touch events bubble from cards and native scrolling content.
export function startBackGesture(page, event) {
  const point = pointFrom(event, "touches")
  page.backGesture = point ? {
    x: point.clientX,
    y: point.clientY,
    identifier: point.identifier,
    vertical: false
  } : null
}

export function moveBackGesture(page, event) {
  const gesture = page.backGesture
  const point = pointFrom(event, "touches")
  if (!gesture) return
  if (!point || point.identifier !== gesture.identifier) {
    page.backGesture = null
    return
  }
  const dx = Math.abs(point.clientX - gesture.x)
  const dy = Math.abs(point.clientY - gesture.y)
  if (dx > 16 || dy > 16) page.ignoreTapUntil = Date.now() + 350
  if (dy > 24 && dy > dx) gesture.vertical = true
}

export function endBackGesture(page, event) {
  const gesture = page.backGesture
  page.backGesture = null
  const point = pointFrom(event, "changedTouches")
  if (!gesture || !point || point.identifier !== gesture.identifier || gesture.vertical) return
  const dx = point.clientX - gesture.x
  const dy = Math.abs(point.clientY - gesture.y)
  if (Math.abs(dx) > 16 || dy > 16) page.ignoreTapUntil = Date.now() + 350
  if (dx >= 60 && dx > dy * 1.5) goBack(page)
}
