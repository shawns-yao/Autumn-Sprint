import { useEffect, useRef } from 'react'

type Point = { x: number; y: number }
type FlightPoint = Point & { distance: number }
type Curve = [Point, Point, Point, Point]
type FlightVariant = 'hero' | 'header'

const headerRoute: Curve[] = [
  [{ x: -.2, y: .8 }, { x: .02, y: .93 }, { x: .26, y: .86 }, { x: .45, y: .59 }],
  [{ x: .45, y: .59 }, { x: .62, y: .18 }, { x: .32, y: .22 }, { x: .44, y: .53 }],
  [{ x: .44, y: .53 }, { x: .63, y: .79 }, { x: .96, y: .31 }, { x: 1.2, y: .05 }],
]
const desktopRoute: Curve[] = [
  [{ x: -.12, y: .78 }, { x: .16, y: .54 }, { x: .39, y: .98 }, { x: .68, y: .77 }],
  [{ x: .68, y: .77 }, { x: .81, y: .67 }, { x: .93, y: .35 }, { x: .86, y: .30 }],
  [{ x: .86, y: .30 }, { x: .76, y: .24 }, { x: .79, y: .62 }, { x: .92, y: .41 }],
  [{ x: .92, y: .41 }, { x: 1.04, y: .23 }, { x: 1.07, y: .03 }, { x: 1.18, y: -.05 }],
]
const mobileRoute: Curve[] = [
  [{ x: -.2, y: .84 }, { x: .20, y: .74 }, { x: .52, y: .98 }, { x: .83, y: .83 }],
  [{ x: .83, y: .83 }, { x: 1.05, y: .70 }, { x: .99, y: .42 }, { x: .95, y: .28 }],
  [{ x: .95, y: .28 }, { x: .88, y: .06 }, { x: 1.08, y: .09 }, { x: 1.24, y: -.08 }],
]

function sampleRoute(width: number, height: number, variant: FlightVariant) {
  const points: FlightPoint[] = []
  let distance = 0
  for (const [a, b, c, d] of variant === 'header' ? headerRoute : width <= 760 ? mobileRoute : desktopRoute) {
    for (let step = 0; step <= 100; step++) {
      const t = step / 100
      const u = 1 - t
      const point = {
        x: (u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x) * width,
        y: (u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y) * height,
      }
      const previous = points.at(-1)
      if (previous) distance += Math.hypot(point.x - previous.x, point.y - previous.y)
      points.push({ ...point, distance })
    }
  }
  return points
}

function pointAt(points: FlightPoint[], distance: number): Point {
  let low = 0
  let high = points.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (points[middle].distance < distance) low = middle + 1
    else high = middle
  }
  const end = points[low]
  const start = points[Math.max(0, low - 1)]
  const ratio = Math.min(1, Math.max(0, (distance - start.distance) / (end.distance - start.distance || 1)))
  return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
}

export default function HomeFlight({ variant = 'hero' }: { variant?: FlightVariant }) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const planeRef = useRef<HTMLImageElement>(null)
  const progressRef = useRef(.72)

  useEffect(() => {
    const scene = sceneRef.current
    const canvas = canvasRef.current
    const plane = planeRef.current
    const context = canvas?.getContext('2d')
    if (!scene || !canvas || !plane || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let previousTime = 0
    let width = 0
    let height = 0
    let route: FlightPoint[] = []
    let total = 0

    function draw() {
      if (!context || !canvas || !plane || !route.length) return
      context.clearRect(0, 0, width, height)
      const head = (reducedMotion.matches ? .76 : progressRef.current) * total
      const size = variant === 'header' ? 56 : width <= 760 ? 80 : 146
      const tailLength = variant === 'header' ? width * .75 : Math.min(width * .35, 470)
      const tailStart = Math.max(0, head - tailLength)
      context.lineWidth = variant === 'header' || width <= 760 ? 1.4 : 2
      context.lineCap = 'round'

      // Arc-length samples keep both flight speed and dash spacing consistent through the turn.
      for (let distance = Math.ceil(tailStart / 18) * 18; distance < head - size * .28; distance += 18) {
        const start = pointAt(route, distance)
        const end = pointAt(route, Math.min(distance + 7, head - size * .28))
        const opacity = ((distance - tailStart) / tailLength) * .4
        context.strokeStyle = `rgba(58, 169, 146, ${opacity})`
        context.beginPath()
        context.moveTo(start.x, start.y)
        context.lineTo(end.x, end.y)
        context.stroke()
      }

      const position = pointAt(route, head)
      const next = pointAt(route, Math.min(head + 2, total))
      const angle = Math.atan2(next.y - position.y, next.x - position.x) * 180 / Math.PI + 38
      plane.style.transform = `translate3d(${position.x - size / 2}px, ${position.y - size * 139 / 342}px, 0) rotate(${angle}deg)`
    }

    function tick(time: number) {
      if (previousTime) progressRef.current = (progressRef.current + Math.min(time - previousTime, 64) / 26000) % 1
      previousTime = time
      draw()
      frame = requestAnimationFrame(tick)
    }

    function syncAnimation() {
      cancelAnimationFrame(frame)
      previousTime = 0
      draw()
      if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(tick)
    }

    function resize() {
      if (!scene || !canvas || !context) return
      width = scene.clientWidth
      height = scene.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      route = sampleRoute(width, height, variant)
      total = route.at(-1)?.distance || 0
      draw()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(scene)
    resize()
    syncAnimation()
    reducedMotion.addEventListener('change', syncAnimation)
    document.addEventListener('visibilitychange', syncAnimation)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      reducedMotion.removeEventListener('change', syncAnimation)
      document.removeEventListener('visibilitychange', syncAnimation)
    }
  }, [variant])

  return <div ref={sceneRef} className={`welcome-flight welcome-flight--${variant}`} aria-hidden="true">
    <canvas ref={canvasRef} className="welcome-flight-trail" />
    <img ref={planeRef} className="welcome-flight-plane" src="/images/home-plane-mint.webp" alt="" width="171" height="139" draggable={false} />
  </div>
}
