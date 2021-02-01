import { LegendMarkerCfg } from '@antv/component';
import { ShapeAttrs } from '@antv/g-svg';
import { deepMix, isString, each, get, isFunction } from '@antv/util';
import View from '../chart/view';
import { DIRECTION } from '../constant';
import { Attribute, Tick } from '../dependents';
import Geometry from '../geometry/base';
import { LegendItem, MarkerCfg } from '../interface';
import { getMappingValue } from './attr';
import { omit } from './helper';
import { MarkerSymbols } from './marker';

/** 线条形 marker symbol */
const STROKES_SYMBOLS = ['line', 'cross', 'tick', 'plus', 'hyphen'];

/**
 * 处理用户配置的 marker style
 * @param markerStyle
 * @param userMarker.style
 * @returns {ShapeAttrs} newStyle
 */
function handleUserMarkerStyle(markerStyle: ShapeAttrs, style: MarkerCfg['style']): ShapeAttrs {
  if (isFunction(style)) {
    return style(markerStyle);
  }
  return deepMix({}, markerStyle, style);
}

/**
 * 根据 marker 是否为线条形 symbol, 来调整下样式
 * @param symbol
 * @param style
 * @param color
 */
function adpatorMarkerStyle(marker: LegendMarkerCfg, color: string) {
  const symbol = marker.symbol;
  if (isString(symbol) && STROKES_SYMBOLS.indexOf(symbol) !== -1) {
    const lineWidth = get(marker.style, 'lineWidth', 1);
    const stroke = get(marker.style, 'stroke', color);
    return deepMix({}, marker.style, { lineWidth, stroke, fill: null });
  }
}

/**
 * 设置 marker 的 symbol，将 字符串的 symbol 转换为真正的绘制命令
 * @param marker
 */
function setMarkerSymbol(marker: LegendMarkerCfg): void {
  const symbol = marker.symbol;
  if (isString(symbol) && MarkerSymbols[symbol]) {
    marker.symbol = MarkerSymbols[symbol];
  }
}

/**
 * @ignore
 * get the legend layout from direction
 * @param direction
 * @returns layout 'horizontal' | 'vertical'
 */
export function getLegendLayout(direction: DIRECTION): 'vertical' | 'horizontal' {
  return direction.startsWith(DIRECTION.LEFT) || direction.startsWith(DIRECTION.RIGHT) ? 'vertical' : 'horizontal';
}

/** item of @antv/component legend  */
type ComponentLegendItem = Omit<LegendItem, 'marker'> & {
  marker: any;
};

/**
 * @ignore
 * get the legend items
 * @param view
 * @param geometry
 * @param attr
 * @param themeMarker
 * @param userMarker
 * @returns legend items
 */
export function getLegendItems(
  view: View,
  geometry: Geometry,
  attr: Attribute,
  themeMarker: object,
  userMarker
): ComponentLegendItem[] {
  const scale = attr.getScale(attr.type);
  if (scale.isCategory) {
    const field = scale.field;
    const colorAttr = geometry.getAttribute('color');
    const shapeAttr = geometry.getAttribute('shape');
    const defaultColor = view.getTheme().defaultColor;
    const isInPolar = geometry.coordinate.isPolar;

    return scale.getTicks().map((tick: Tick) => {
      const { text, value: scaleValue } = tick;
      const name = text;
      const value = scale.invert(scaleValue);

      // 通过过滤图例项的数据，来看是否 unchecked
      let unchecked = view.filterFieldData(field, [{ [field]: value }]).length === 0;
      each(view.views, (subView) => {
        if (!subView.filterFieldData(field, [{ [field]: value }]).length) {
          unchecked = true;
        }
      });

      // @ts-ignore
      const color = getMappingValue(colorAttr, value, defaultColor);
      const shape = getMappingValue(shapeAttr, value, 'point');
      let marker = geometry.getShapeMarker(shape, {
        color,
        isInPolar,
      });
      // the marker configure order should be ensure
      marker = deepMix({}, themeMarker, marker, omit({ ...userMarker }, ['style']));
      adpatorMarkerStyle(marker, color);
      if (userMarker && userMarker.style) {
        // handle user's style settings
        marker.style = handleUserMarkerStyle(marker.style, userMarker.style);
      }
      setMarkerSymbol(marker);

      return { id: value, name, value, marker, unchecked };
    });
  }
  return [];
}

/**
 *
 * @ignore
 * custom legend 的 items 获取
 * @param themeMarker
 * @param userMarker
 * @param customItems
 */
export function getCustomLegendItems(themeMarker: object, userMarker: object, customItems: LegendItem[]) {
  // 如果有自定义的 item，那么就直接使用，并合并主题的 marker 配置
  return customItems.map((item: LegendItem) => {
    const marker = deepMix({}, themeMarker, userMarker, item.marker);
    setMarkerSymbol(marker);

    item.marker = marker;
    return item;
  });
}
