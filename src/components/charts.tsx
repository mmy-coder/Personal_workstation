"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { categoryColors } from "@/lib/types";
import { Empty } from "./ui/shared";
import { chartValue } from "@/lib/format";
type Row = { name: string; [key: string]: string | number };
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text)",
};
export function SeriesChart({
  rows,
  series,
  type = "bar",
  unit = "小时",
}: {
  rows: Row[];
  series: { key: string; color: string }[];
  type?: "bar" | "line";
  unit?: string;
}) {
  if (!rows.some((r) => series.some((s) => Number(r[s.key]) > 0)))
    return (
      <div className="chart-empty">
        <Empty
          title="等待第一笔数据"
          description="添加记录后，这里会呈现真实的变化。"
        />
      </div>
    );
  const axes = (
    <>
      <CartesianGrid
        stroke="var(--border)"
        vertical={false}
        strokeDasharray="3 4"
      />
      <XAxis
        dataKey="name"
        tick={{ fill: "var(--muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        minTickGap={15}
        dy={6}
      />
      <YAxis
        tick={{ fill: "var(--muted)", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        width={35}
      />
      <Tooltip
        contentStyle={tooltipStyle}
        cursor={{ fill: "var(--hover)" }}
        formatter={(value, name) => [
          `${chartValue(Number(value), unit)} ${unit}`,
          name,
        ]}
      />
      <Legend
        iconType="circle"
        iconSize={7}
        wrapperStyle={{ fontSize: 11, paddingTop: 15 }}
      />
    </>
  );
  return (
    <div
      className="chart"
      role="img"
      aria-label={rows
        .map(
          (r) =>
            `${r.name}：${series.map((s) => `${s.key} ${r[s.key]} ${unit}`).join("，")}`,
        )
        .join("；")}
    >
      <ResponsiveContainer width="100%" height="100%">
        {type === "bar" ? (
          <BarChart
            data={rows}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          >
            {axes}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart
            data={rows}
            margin={{ top: 12, right: 18, left: 0, bottom: 0 }}
          >
            {axes}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function DonutChart({
  rows,
  unit = "小时",
  totalLabel = "计划时间",
  compactTotal = false,
}: {
  rows: { name: string; value: number }[];
  unit?: string;
  totalLabel?: string;
  compactTotal?: boolean;
}) {
  const values = rows.filter((r) => r.value > 0),
    total = values.reduce((sum, r) => sum + r.value, 0);
  const scale =
    compactTotal && total >= 1e8 ? 1e8 : compactTotal && total >= 1e4 ? 1e4 : 1;
  const centerUnit = scale === 1e8 ? "亿元" : scale === 1e4 ? "万元" : unit;
  if (!total)
    return (
      <div className="chart-empty">
        <Empty
          title="还没有分布数据"
          description="记录之后，每一部分都会清晰可见。"
        />
      </div>
    );
  return (
    <div className="donut-layout">
      <div
        className="donut-plot"
        role="img"
        aria-label={values
          .map((r) => `${r.name} ${chartValue(r.value, unit)} ${unit}`)
          .join("，")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={values}
              innerRadius="69%"
              outerRadius="90%"
              paddingAngle={3}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {values.map((r) => (
                <Cell
                  key={r.name}
                  fill={categoryColors[r.name] || categoryColors["其他"]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [
                `${chartValue(Number(value), unit)} ${unit}`,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong
            className={compactTotal ? "donut-money-total" : undefined}
            title={`${chartValue(total, unit)} ${unit}`}
          >
            {chartValue(total / scale, unit)}
          </strong>
          <span>
            {compactTotal ? `${totalLabel}（${centerUnit}）` : totalLabel}
          </span>
        </div>
      </div>
      <div className="donut-legend">
        {values.map((r) => (
          <div key={r.name}>
            <i
              style={{
                background: categoryColors[r.name] || categoryColors["其他"],
              }}
            />
            <span>{r.name}</span>
            <strong>
              {unit === "元"
                ? (r.value / total) * 100 < 0.1
                  ? "<0.1"
                  : ((r.value / total) * 100).toFixed(1)
                : Math.round((r.value / total) * 100)}
              %
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
