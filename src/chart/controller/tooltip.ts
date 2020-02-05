import { vec2 } from '@antv/matrix-util';
import { deepMix, each, find, get, isArray, isEqual, isFunction, set } from '@antv/util';
import { Crosshair, HtmlTooltip, IGroup } from '../../dependents';
import Geometry from '../../geometry/base';
import { MappingDatum, Point } from '../../interface';
import { getDistanceToCenter, getPointAngle } from '../../util/coordinate';
import { polarToCartesian } from '../../util/graphics';
import { findDataByPoint, getTooltipItems } from '../../util/tooltip';
import { TooltipOption } from '../interface';
import { Controller } from './base';

// Filter duplicates, use `name`, `color`, `value` and `title` property values as condition
function uniq(items) {
  const uniqItems = [];
  each(items, (item) => {
    const result = find(uniqItems, (subItem) => {
      return (
        subItem.color === item.color &&
        subItem.name === item.name &&
        subItem.value === item.value &&
        subItem.title === item.title
      );
    });
    if (!result) {
      uniqItems.push(item);
    }
  });
  return uniqItems;
}

export default class Tooltip extends Controller<TooltipOption> {
  private tooltip;
  private tooltipMarkersGroup: IGroup;
  private tooltipCrosshairsGroup: IGroup;
  private xCrosshair;
  private yCrosshair;
  private guideGroup: IGroup;

  private isVisible: boolean = true;
  private items;
  private title: string;
  private tooltipInteraction;

  public get name(): string {
    return 'tooltip';
  }

  public init() { }

  public render() {
    if (this.tooltip) {
      return;
    }

    this.option = this.view.getOptions().tooltip;
    this.isVisible = this.option !== false;

    const view = this.view;

    const canvas = view.getCanvas();
    const region = {
      start: { x: 0, y: 0 },
      end: { x: canvas.get('width'), y: canvas.get('height') },
    };

    const cfg = this.getTooltipCfg();
    const tooltip = new HtmlTooltip({
      parent: canvas.get('el').parentNode,
      region,
      ...cfg,
      visible: false,
      crosshairs: null,
    });

    tooltip.init();

    this.tooltip = tooltip;

    if (this.isVisible && !this.tooltipInteraction) {
      // 用户开启 Tooltip
      view.interaction('tooltip');
      this.tooltipInteraction = get(view.getOptions(), ['interactions', 'tooltip']);
    }
  }

  /**
   * Shows tooltip
   * @param point
   */
  public showTooltip(point: Point) {
    const { view, tooltip } = this;
    const items = this.getTooltipItems(point);
    if (!items.length) {
      return;
    }

    const cfg = this.getTooltipCfg();
    const title = this.getTitle(items);

    const follow = cfg.follow;
    let location;
    if (follow) {
      // 跟随鼠标
      location = point;
    } else {
      // 定位到数据点
      location = {
        x: items[0].x,
        y: items[0].y,
      };
    }

    tooltip.update({
      ...cfg,
      items,
      title,
      ...location,
    });
    tooltip.show();

    view.emit('tooltip:show', {
      tooltip,
      items,
      title,
      ...point,
    });

    const lastItems = this.items;
    const lastTitle = this.title;
    if (!isEqual(lastTitle, title) || !isEqual(lastItems, items)) {
      // 内容发生变化
      view.emit('tooltip:change', {
        tooltip,
        items,
        title,
        ...point,
      });
    }
    this.items = items;
    this.title = title;

    const { showTooltipMarkers, showCrosshairs } = cfg;
    if (showTooltipMarkers) {
      // 展示 tooltipMarkers
      this.renderTooltipMarkers(cfg);
    }
    if (showCrosshairs) {
      // 展示 tooltip 辅助线
      this.renderCrosshairs(location, cfg);
    }
  }

  public hideTooltip() {
    const { view, tooltip } = this;

    // hide the tooltipMarkers
    const tooltipMarkersGroup = this.tooltipMarkersGroup;
    if (tooltipMarkersGroup) {
      tooltipMarkersGroup.hide();
    }

    // hide crosshairs
    const xCrosshair = this.xCrosshair;
    const yCrosshair = this.yCrosshair;
    if (xCrosshair) {
      xCrosshair.hide();
    }
    if (yCrosshair) {
      yCrosshair.hide();
    }

    // @ts-ignore
    tooltip.hide();

    view.emit('tooltip:hide', {
      tooltip: this.tooltip,
    });
  }

  public clear() {
    const { tooltip, xCrosshair, yCrosshair } = this;
    if (tooltip) {
      tooltip.clear();
      tooltip.hide();
    }

    if (xCrosshair) {
      xCrosshair.clear();
    }

    if (yCrosshair) {
      yCrosshair.clear();
    }
  }

  public destroy() {
    if (this.tooltip) {
      this.tooltip.destroy();
    }
    if (this.xCrosshair) {
      this.xCrosshair.destroy();
    }
    if (this.yCrosshair) {
      this.yCrosshair.destroy();
    }

    if (this.guideGroup) {
      this.guideGroup.remove(true);
    }

    this.items = null;
    this.title = null;
    this.tooltipMarkersGroup = null;
    this.tooltipCrosshairsGroup = null;
    this.xCrosshair = null;
    this.yCrosshair = null;
    this.tooltip = null;
    this.guideGroup = null;

    if (this.tooltipInteraction) {
      this.tooltipInteraction.destroy();
      this.tooltipInteraction = null;
    }
  }

  public changeVisible(visible: boolean) {
    if (this.visible === visible) {
      return;
    }
    const { tooltip, tooltipMarkersGroup, xCrosshair, yCrosshair } = this;
    if (visible) {
      if (tooltip) {
        tooltip.show();
      }
      if (tooltipMarkersGroup) {
        tooltipMarkersGroup.show();
      }
      if (xCrosshair) {
        xCrosshair.show();
      }
      if (yCrosshair) {
        yCrosshair.show();
      }
    } else {
      if (tooltip) {
        tooltip.hide();
      }
      if (tooltipMarkersGroup) {
        tooltipMarkersGroup.hide();
      }
      if (xCrosshair) {
        xCrosshair.hide();
      }
      if (yCrosshair) {
        yCrosshair.hide();
      }
    }
    this.visible = visible;
  }

  public getTooltipItems(point: Point) {
    let items = [];

    const geometries = this.view.geometries;
    const { shared, title } = this.getTooltipCfg();
    // TODO: 对于 shared 的处理有问题
    each(geometries, (geometry: Geometry) => {
      if (geometry.visible && geometry.tooltipOption !== false) {
        // geometry 可见同时未关闭 tooltip
        const dataArray = geometry.dataArray;
        if (shared !== false) {
          // 用户未配置 share: false
          each(dataArray, (data: MappingDatum[]) => {
            const record = findDataByPoint(point, data, geometry);
            if (record) {
              const tooltipItems = getTooltipItems(record, geometry, title);
              items = items.concat(tooltipItems);
            }
          });
        } else {
          const container = geometry.container;
          const shape = container.getShape(point.x, point.y);
          if (shape && shape.get('visible') && shape.get('origin')) {
            const mappingData = shape.get('origin').mappingData;
            if (isArray(mappingData)) {
              const record = findDataByPoint(point, mappingData, geometry);
              if (record) {
                items = items.concat(getTooltipItems(record, geometry, title));
              }
            } else {
              items = items.concat(getTooltipItems(mappingData, geometry, title));
            }
          }
        }
      }
    });

    items = uniq(items); // 去除重复值

    each(items, (item) => {
      const { x, y } = item.mappingData;
      item.x = isArray(x) ? x[x.length - 1] : x;
      item.y = isArray(y) ? y[y.length - 1] : y;
    });

    if (items.length) {
      const first = items[0];
      // bugfix: 由于点图的数据查找策略不同，所以有可能存在相同坐标点，查到的数据 x 字段不同的情况（即 title 不同）
      // 比如带点的折线图
      if (!items.every((item) => item.title === first.title)) {
        let nearestItem = first;
        let nearestDistance = Infinity;
        items.forEach((item) => {
          const distance = vec2.distance([point.x, point.y], [item.x, item.y]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestItem = item;
          }
        });
        items = items.filter((item) => item.title === nearestItem.title);
      }
    }

    return items;
  }

  public layout() { }
  public update() {
    this.clear();
    // 更新 tooltip 配置
    this.option = this.view.getOptions().tooltip;
  }


  // 获取 tooltip 配置，因为用户可能会通过 view.tooltip() 重新配置 tooltip，所以就不做缓存，每次直接读取
  private getTooltipCfg() {
      const view = this.view;
      const option = this.option;
      const theme = view.getTheme();
      const defaultCfg = get(theme, ['components', 'tooltip'], {});
      return deepMix({}, defaultCfg, option);
  }

  private getTitle(items) {
    const title = items[0].title || items[0].name;
    this.title = title;

    return title;
  }

  private renderTooltipMarkers(cfg) {
    const tooltipMarkersGroup = this.getTooltipMarkersGroup();
    each(this.items, (item) => {
      const { x, y } = item;
      const attrs = {
        fill: item.color,
        symbol: 'circle',
        shadowColor: item.color,
        ...cfg.tooltipMarker,
        x,
        y,
      };

      tooltipMarkersGroup.addShape('marker', {
        attrs,
      });
    });
  }

  private renderCrosshairs(point: Point, cfg) {
    const crosshairsType = get(cfg, ['crosshairs', 'type'], 'x'); // 默认展示 x 轴上的辅助线
    if (crosshairsType === 'x') {
      if (this.yCrosshair) {
        this.yCrosshair.hide();
      }
      this.renderXCrosshairs(point, cfg);
    } else if (crosshairsType === 'y') {
      if (this.xCrosshair) {
        this.xCrosshair.hide();
      }
      this.renderYCrosshairs(point, cfg);
    } else if (crosshairsType === 'xy') {
      this.renderXCrosshairs(point, cfg);
      this.renderYCrosshairs(point, cfg);
    }
  }

  // 渲染 x 轴上的 tooltip 辅助线
  private renderXCrosshairs(point: Point, tooltipCfg) {
    const coordinate = this.view.getCoordinate();
    let start;
    let end;
    if (coordinate.isRect) {
      if (coordinate.isTransposed) {
        start = {
          x: coordinate.start.x,
          y: point.y,
        };
        end = {
          x: coordinate.end.x,
          y: point.y,
        };
      } else {
        start = {
          x: point.x,
          y: coordinate.end.y,
        };
        end = {
          x: point.x,
          y: coordinate.start.y,
        };
      }
    } else {
      // 极坐标下 x 轴上的 crosshairs 表现为半径
      const angle = getPointAngle(coordinate, point);
      const center = coordinate.getCenter();
      // @ts-ignore
      const radius = coordinate.getRadius();
      end = polarToCartesian(center.x, center.y, radius, angle);
      start = center;
    }

    const cfg = deepMix({
      start,
      end,
      container: this.getTooltipCrosshairsGroup(),
    }, get(tooltipCfg, 'crosshairs', {}), this.getCrosshairsText('x', point, tooltipCfg));
    delete cfg.type; // 与 Crosshairs 组件的 type 冲突故删除

    let xCrosshair = this.xCrosshair;
    if (xCrosshair) {
      xCrosshair.update(cfg);
    } else {
      xCrosshair = new Crosshair.Line(cfg);
      xCrosshair.init();
    }
    xCrosshair.show();
    this.xCrosshair = xCrosshair;
  }

  // 渲染 y 轴上的辅助线
  private renderYCrosshairs(point: Point, tooltipCfg) {
    const coordinate = this.view.getCoordinate();
    let cfg;
    let type;
    if (coordinate.isRect) {
      let start;
      let end;
      if (coordinate.isTransposed) {
        start = {
          x: point.x,
          y: coordinate.end.y,
        };
        end = {
          x: point.x,
          y: coordinate.start.y,
        };
      } else {
        start = {
          x: coordinate.start.x,
          y: point.y,
        };
        end = {
          x: coordinate.end.x,
          y: point.y,
        };
      }
      cfg = {
        start,
        end,
      };
      type = 'Line';
    } else {
      // 极坐标下 y 轴上的 crosshairs 表现为圆弧
      cfg = {
        center: coordinate.getCenter(),
        // @ts-ignore
        radius: getDistanceToCenter(coordinate, point),
        startAngle: coordinate.startAngle,
        endAngle: coordinate.endAngle,
      };
      type = 'Circle';
    }

    cfg = deepMix({
      container: this.getTooltipCrosshairsGroup()
    }, cfg, get(tooltipCfg, 'crosshairs', {}), this.getCrosshairsText('y', point, tooltipCfg));
    delete cfg.type; // 与 Crosshairs 组件的 type 冲突故删除

    let yCrosshair = this.yCrosshair;
    if (yCrosshair) {
      // 如果坐标系发生直角坐标系与极坐标的切换操作
      if ((coordinate.isRect && yCrosshair.get('type') === 'circle')
        || (!coordinate.isRect && yCrosshair.get('type') === 'line')) {
        yCrosshair = new Crosshair[type](cfg);
        yCrosshair.init();
      } else {
        yCrosshair.update(cfg);
      }
    } else {
      yCrosshair = new Crosshair[type](cfg);
      yCrosshair.init();
    }

    yCrosshair.show();
    this.yCrosshair = yCrosshair;
  }

  private getCrosshairsText(type, point: Point, tooltipCfg) {
    let textCfg = get(tooltipCfg, ['crosshairs', 'text']);
    const follow = tooltipCfg.follow;
    const items = this.items;

    if (textCfg) {
      // 需要展示文本
      const firstItem = items[0];
      const xScale = this.view.getXScale();
      const yScale = this.view.getYScales()[0];
      let xValue;
      let yValue;
      if (follow) {
        // 如果需要跟随鼠标移动，就需要将当前鼠标坐标点转换为对应的数值
        const invertPoint = this.view.getCoordinate().invert(point);
        xValue = xScale.invert(invertPoint.x); // 转换为原始值
        yValue = yScale.invert(invertPoint.y); // 转换为原始值
      } else {
        xValue = firstItem.data[xScale.field];
        yValue = firstItem.data[yScale.field];
      }

      const content = type === 'x' ? xValue : yValue;
      if (isFunction(textCfg)) {
        textCfg = textCfg(type, content, items, point);
      } else {
        textCfg.content = content;
      }

      return {
        text: textCfg,
      };
    }
  }

  // 获取存储 tooltipMarkers 和 crosshairs 的容器
  private getGuideGroup() {
    if (!this.guideGroup) {
      const foregroundGroup = this.view.foregroundGroup;
      this.guideGroup = foregroundGroup.addGroup({
        name: 'tooltipGuide',
      });
    }

    return this.guideGroup;
  }

  // 获取 tooltipMarkers 存储的容器
  private getTooltipMarkersGroup() {
    let tooltipMarkersGroup = this.tooltipMarkersGroup;
    if (tooltipMarkersGroup && !tooltipMarkersGroup.destroyed) {
      tooltipMarkersGroup.clear();
      tooltipMarkersGroup.show();
    } else {
      tooltipMarkersGroup = this.getGuideGroup().addGroup({
        name: 'tooltipMarkersGroup',
      });
      tooltipMarkersGroup.toFront();
      this.tooltipMarkersGroup = tooltipMarkersGroup;
    }
    return tooltipMarkersGroup;
  }

  // 获取 tooltip crosshairs 存储的容器
  private getTooltipCrosshairsGroup() {
    let tooltipCrosshairsGroup = this.tooltipCrosshairsGroup;
    if (!tooltipCrosshairsGroup) {
      tooltipCrosshairsGroup = this.getGuideGroup().addGroup({
        name: 'tooltipCrosshairsGroup',
        capture: false,
      });
      tooltipCrosshairsGroup.toBack();
      this.tooltipCrosshairsGroup = tooltipCrosshairsGroup;
    }
    return tooltipCrosshairsGroup;
  }
}
