export default function Spark({ data, color, height = 40, width = 100 }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data);
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
