import { useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

use([BarChart, LineChart, PieChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, SVGRenderer]);

interface EChartSurfaceProps {
  option: EChartsOption;
  height?: number;
  className?: string;
  ariaLabel: string;
}

function getThemeMode() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function EChartSurface({ option, height = 220, className, ariaLabel }: EChartSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [themeMode, setThemeMode] = useState(getThemeMode);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeMode(getThemeMode());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const chart = init(node, undefined, { renderer: 'svg' });
    chart.setOption(option, true);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [option, themeMode]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
