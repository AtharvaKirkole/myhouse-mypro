"use client";

import { useState } from "react";

interface Props {
  months: string[];
  values: number[];
}

const W = 640;
const H = 220;
const M = { l: 46, r: 8, t: 14, b: 26 };

/* bar path rounded only at the top, anchored to the baseline */
function topRoundedBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

export default function EnergyChart({ months, values }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const yMax = 2500;
  const ticks = [0, 1000, 2000];
  const slot = plotW / months.length;
  const barW = Math.min(26, slot - 8);

  const yFor = (v: number) => M.t + plotH - (v / yMax) * plotH;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Monthly energy use in kilowatt hours for the last twelve months"
        className="w-full"
      >
        {/* gridlines + tick labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={M.l - 8}
              y={yFor(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t === 0 ? "0" : `${t / 1000}k`}
            </text>
          </g>
        ))}

        {/* baseline */}
        <line
          x1={M.l}
          x2={W - M.r}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="var(--axis)"
          strokeWidth={1}
        />

        {/* bars */}
        {values.map((v, i) => {
          const cx = M.l + slot * i + slot / 2;
          const y = yFor(v);
          const h = yFor(0) - y;
          const active = hover === i;
          return (
            <g key={months[i]}>
              <path
                d={topRoundedBar(cx - barW / 2, y, barW, h, 4)}
                fill={active ? "var(--seq-550)" : "var(--seq-450)"}
              />
              {/* oversized hit target */}
              <rect
                x={M.l + slot * i}
                y={M.t}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--ink-muted)"
              >
                {months[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* tooltip */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow"
          style={{
            left: `${((M.l + slot * hover + slot / 2) / W) * 100}%`,
            top: `${(yFor(values[hover]) / H) * 100}%`,
          }}
        >
          {months[hover]} · {values[hover].toLocaleString()} kWh
        </div>
      )}

      {/* table fallback */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-700">
          View as table
        </summary>
        <table className="mt-2 w-full text-left text-xs text-stone-600">
          <thead>
            <tr>
              <th className="py-1 pr-4 font-medium">Month</th>
              <th className="py-1 font-medium">kWh</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m} className="border-t border-stone-100">
                <td className="py-1 pr-4">{m}</td>
                <td className="py-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {values[i].toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
