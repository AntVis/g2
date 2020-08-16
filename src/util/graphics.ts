import { each, isEmpty, isNumber, isNumberEqual } from '@antv/util';
import { Coordinate, IElement, IShape } from '../dependents';
import { getEngine } from '../engine';
import { ShapeInfo } from '../interface';
import { rotate, getRotateMatrix } from './transform';

// 获取图形的包围盒
function getPointsBox(points) {
  if (isEmpty(points)) {
    return null;
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  each(points, (point) => {
    minX = minX > point.x ? point.x : minX;
    maxX = maxX < point.x ? point.x : maxX;
    minY = minY > point.y ? point.y : minY;
    maxY = maxY < point.y ? point.y : maxY;
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * @ignore
 * 根据弧度计算极坐标系下的坐标点
 * @param centerX
 * @param centerY
 * @param radius
 * @param angleInRadian
 * @returns
 */
export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInRadian: number) {
  return {
    x: centerX + radius * Math.cos(angleInRadian),
    y: centerY + radius * Math.sin(angleInRadian),
  };
}

/**
 * @ignore
 * 根据起始角度计算绘制扇形的 path
 * @param centerX
 * @param centerY
 * @param radius
 * @param startAngleInRadian
 * @param endAngleInRadian
 * @returns
 */
export function getSectorPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleInRadian: number,
  endAngleInRadian: number,
  innerRadius: number = 0
) {
  const start = polarToCartesian(centerX, centerY, radius, startAngleInRadian);
  const end = polarToCartesian(centerX, centerY, radius, endAngleInRadian);

  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngleInRadian);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngleInRadian);

  if (endAngleInRadian - startAngleInRadian === Math.PI * 2) {
    // 整个圆是分割成两个圆
    const middlePoint = polarToCartesian(centerX, centerY, radius, startAngleInRadian + Math.PI);
    const innerMiddlePoint = polarToCartesian(centerX, centerY, innerRadius, startAngleInRadian + Math.PI);
    const circlePathCommands = [
      ['M', start.x, start.y],
      ['A', radius, radius, 0, 1, 1, middlePoint.x, middlePoint.y],
      ['A', radius, radius, 0, 1, 1, end.x, end.y],
      ['M', innerStart.x, innerStart.y],
    ];
    if (innerRadius) {
      circlePathCommands.push(['A', innerRadius, innerRadius, 0, 1, 0, innerMiddlePoint.x, innerMiddlePoint.y]);
      circlePathCommands.push(['A', innerRadius, innerRadius, 0, 1, 0, innerEnd.x, innerEnd.y]);
    }

    circlePathCommands.push(['M', start.x, start.y]);
    circlePathCommands.push(['Z']);

    return circlePathCommands;
  }

  const arcSweep = endAngleInRadian - startAngleInRadian <= Math.PI ? 0 : 1;
  const sectorPathCommands = [
    ['M', start.x, start.y],
    ['A', radius, radius, 0, arcSweep, 1, end.x, end.y],
    ['L', innerEnd.x, innerEnd.y],
  ];
  if (innerRadius) {
    sectorPathCommands.push(['A', innerRadius, innerRadius, 0, arcSweep, 0, innerStart.x, innerStart.y]);
  }
  sectorPathCommands.push(['L', start.x, start.y]);
  sectorPathCommands.push(['Z']);

  return sectorPathCommands;
}

/**
 * @ignore
 * Gets arc path
 * @param centerX
 * @param centerY
 * @param radius
 * @param startAngleInRadian
 * @param endAngleInRadian
 * @returns
 */
export function getArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngleInRadian: number,
  endAngleInRadian: number
) {
  const start = polarToCartesian(centerX, centerY, radius, startAngleInRadian);
  const end = polarToCartesian(centerX, centerY, radius, endAngleInRadian);

  if (isNumberEqual(endAngleInRadian - startAngleInRadian, Math.PI * 2)) {
    const middlePoint = polarToCartesian(centerX, centerY, radius, startAngleInRadian + Math.PI);
    return [
      ['M', start.x, start.y],
      ['A', radius, radius, 0, 1, 1, middlePoint.x, middlePoint.y],
      ['A', radius, radius, 0, 1, 1, start.x, start.y],
      ['A', radius, radius, 0, 1, 0, middlePoint.x, middlePoint.y],
      ['A', radius, radius, 0, 1, 0, start.x, start.y],
      ['Z'],
    ];
  }
  const arcSweep = endAngleInRadian - startAngleInRadian <= Math.PI ? 0 : 1;
  return [
    ['M', start.x, start.y],
    ['A', radius, radius, 0, arcSweep, 1, end.x, end.y],
  ];
}

/**
 * @ignore
 * 从数据模型中的 points 换算角度
 * @param shapeModel
 * @param coordinate
 * @returns
 */
export function getAngle(shapeModel: ShapeInfo, coordinate: Coordinate) {
  const points = shapeModel.points;
  const box = getPointsBox(points);
  let endAngle;
  let startAngle;
  const { startAngle: coordStartAngle, endAngle: coordEndAngle } = coordinate;
  const diffAngle = coordEndAngle - coordStartAngle;

  if (coordinate.isTransposed) {
    endAngle = box.maxY * diffAngle;
    startAngle = box.minY * diffAngle;
  } else {
    endAngle = box.maxX * diffAngle;
    startAngle = box.minX * diffAngle;
  }
  endAngle += coordStartAngle;
  startAngle += coordStartAngle;
  return {
    startAngle,
    endAngle,
  };
}

/**
 * @ignore
 * 计算多边形重心: https://en.wikipedia.org/wiki/Centroid#Of_a_polygon
 */
export function getPolygonCentroid(xs: number | number[], ys: number | number[]) {
  if (isNumber(xs) && isNumber(ys)) {
    // 普通色块图，xs 和 ys 是数值
    return [xs, ys];
  }
  let i = -1;
  let x = 0;
  let y = 0;
  let former;
  let current = (xs as number[]).length - 1;
  let diff;
  let k = 0;
  while (++i < (xs as number[]).length) {
    former = current;
    current = i;
    k += diff = xs[former] * ys[current] - xs[current] * ys[former];
    x += (xs[former] + xs[current]) * diff;
    y += (ys[former] + ys[current]) * diff;
  }
  k *= 3;
  return [x / k, y / k];
}

/**
 * @ignore
 * 获取需要替换的属性，如果原先图形元素存在，而新图形不存在，则设置 undefined
 */
export function getReplaceAttrs(sourceShape: IShape, targetShape: IShape) {
  const originAttrs = sourceShape.attr();
  const newAttrs = targetShape.attr();
  each(originAttrs, (v, k) => {
    if (newAttrs[k] === undefined) {
      newAttrs[k] = undefined;
    }
  });
  return newAttrs;
}

/**
 * 获取 shape 的矩形包裹框的四个关键点，注意 旋转场景
 * @param shape
 */
export function getKeyPointsOfShape(shape: IShape): number[][] {
  const cloneShape = shape.clone() as IShape;
  const rotateRadian = cloneShape.attr('rotate');

  // revert rotate
  if (rotateRadian) {
    rotate(cloneShape, -rotateRadian);
  }

  // get canvasBBox before rotate
  const { minX, minY, maxX, maxY } = cloneShape.getCanvasBBox();
  const keyPoints = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];

  const G = getEngine('canvas');
  const group = new G.Group({});
  const points = keyPoints.map((point) => {
    const x = point[0];
    const y = point[1];
    const pointShape = group.addShape('circle', { attrs: { x, y, r: 0 } });
    if (rotateRadian) {
      const matrix = getRotateMatrix(cloneShape, rotateRadian);
      pointShape.setMatrix(matrix);
    }
    const pointBBox = pointShape.getCanvasBBox();
    return [pointBBox.x, pointBBox.y];
  });

  group.destroy();
  cloneShape.destroy();

  return points;
}

/**
 * detect whether two shape is intersected, useful when shape is been rotated
 */
export function isIntersect(element1: IElement, element2: IElement, recusive = true) {
  const shape1 = element1.clone();
  const shape2 = element2.clone();

  const keyPoints = getKeyPointsOfShape(shape1 as IShape);
  let isIntersecting = false;

  const G = getEngine('canvas');
  const group = new G.Group({});

  keyPoints.forEach((point) => {
    let shapeBox: IShape;
    if (shape2.isGroup()) {
      const rotateRadian = shape2.attr('rotate');
      // revert rotate
      if (rotateRadian) {
        rotate(shape2 as IShape, -rotateRadian);
      }
      const bbox = shape2.getCanvasBBox();
      shapeBox = group.addShape('rect', {
        attrs: {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          fill: 'transparent',
        },
      });
      // rotate
      if (rotateRadian) {
        rotate(shapeBox, rotateRadian);
      }
    } else {
      shapeBox = shape2 as IShape;
    }
    if (shapeBox.isHit(point[0], point[1])) {
      isIntersecting = true;
    }
  });
  shape1.destroy();
  shape2.destroy();
  group.destroy();

  return isIntersecting || (recusive ? isIntersect(element2, element1, false) : false);
}
