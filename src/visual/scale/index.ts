import { isFunction, isString } from '@antv/util';
import { format } from 'fecha';
import { Time, rPretty, wilkinsonExtended, d3Ticks, d3Log, d3Time } from '@antv/scale';
import { Input, Output, Scale, ScaleDefOptions, ScaleTypes } from '../../types/scale';
import { createScaleByType, strickCount } from '../../util/scale';

/**
 * 该类有两个作用：
 * 1. 存储一些绘制坐标轴需要的参数
 * 2. 增加 @antv/scale 的能力：getText，getTicks 等
 *
 * 其实名字叫 FieldMeta 更好，但是考虑到 G2 旧版本的概念兼容
 * 所以还是用重名的 Scale 命名，它的内部会包含一个真正的 scale 实例
 */
export class ScaleDef {
  /**
   * 真正的做数据映射的 scale 的实例
   */
  private scale: any;

  /**
   * 当前的 options
   */
  private options: ScaleDefOptions = {};

  /**
   * 映射之前的 ticks
   */
  private tickValues: Input[];

  /**
   * 对应的字段
   */
  private field: string;

  /**
   * 构造函数
   * @param options 选项
   * @param field 对应的字段
   */
  constructor(options?: ScaleDefOptions, field?: string) {
    this.update({ type: 'identity', ...options });
    this.field = field;
  }

  /**
   * 更新 options
   * 注意：如果参数中有 type，那么我们会重新初始化新的 scale 实例
   *
   * @param options 更新的配置
   */
  public update(updateOptions: Partial<ScaleDefOptions>) {
    this.updateScaleType(updateOptions);
    this.updateOptions(updateOptions);
    this.updateScaleOptions(updateOptions);
    this.updateExtent();
    this.updateTicks();
  }

  /**
   * 返回输入值进过映射和格式化之后的内容
   * @param v
   * @returns
   */
  public getText(value: Input, index?: number) {
    if (this.options.formatter) return this.options.formatter(value, index);
    return `${value}`;
  }

  /**
   * 获取 ticks，返回原始值，映射之后以及格式化之后的值
   */
  public getTicks() {
    return this.tickValues.map((value, index) => ({
      text: this.getText(value, index),
      tickValue: value,
      value: this.map(value),
    }));
  }

  public getTickValues() {
    return this.tickValues;
  }

  /**
   * 是否是线性连续 scale
   */
  public isContinuous() {
    return this.belongTo('linear', 'log', 'pow', 'sqrt', 'time');
  }

  public isLinear() {
    return this.belongTo('linear');
  }

  /**
   * 是否是离散的分类 scale
   */
  public isCategory() {
    return this.belongTo('ordinal', 'band', 'point', 'cat', 'category', 'timeCat');
  }

  /**
   * 是否是常量的 scale
   */
  public isIdentity() {
    return this.belongTo('identity');
  }

  /**
   * 获取 scale 对应的字段
   * @returns
   */
  public getField() {
    return this.field;
  }

  /**
   * 获取 scale 的配置
   * @returns
   */
  public getOptions() {
    const scaleOptions = this.scale.getOptions();
    return { ...scaleOptions, ...this.options };
  }

  /**
   * 获取某一项配置
   * @param k
   * @returns
   */
  public getOption(k: keyof ScaleDefOptions) {
    return this.getOptions()[k];
  }

  /**
   * 将值映射到值域
   *
   * @param v 需要映射的值
   */
  public map(v: any) {
    const transform = this.options.transform || ((x) => x);
    const input = transform(v);
    return this.scale.map(input);
  }

  /**
   * 将数据逆向映射为原始数据
   *
   * @param v 需要逆向映射的值
   */
  public invert(v: Output) {
    return this.scale.invert(v);
  }

  /**
   * 克隆一个新的 scale
   */
  public clone() {
    return new ScaleDef(this.options);
  }

  private updateScaleType(updateOptions: Partial<ScaleDefOptions> = {}) {
    const { type } = updateOptions;
    if (!type) return;
    if (type !== this.options.type) this.scale = createScaleByType(type);
  }

  private updateOptions(updateOptions: Partial<ScaleDefOptions>) {
    this.options = { ...this.options, ...updateOptions };
    const defaultOptions = this.getDefaultOptions();
    this.options = { ...defaultOptions, ...this.options };
  }

  private updateScaleOptions(updateOptions: Partial<ScaleDefOptions>) {
    const options = {
      ...this.options,
      domain: this.generateDomain(updateOptions),
      tickMethod: this.generateTickMethod(),
    } as any;
    this.scale.update(options);
  }

  private updateExtent() {
    if (!this.isContinuous()) return;
    const domain = this.getOption('domain') as (number | Date)[];
    const min = domain[0];
    const max = domain[domain.length - 1];
    this.options.max = max;
    this.options.min = min;
  }

  private updateTicks() {
    const { transform } = this.getOptions();
    const tickValues = this.calculateTickValues();
    this.tickValues = tickValues.map(transform);
  }

  private getDefaultOptions(): ScaleDefOptions {
    if (this.belongTo('time')) {
      const formatter = (this.scale as Time).getFormatter();
      return {
        transform: (d: string | Date) => (typeof d === 'string' ? new Date(d) : d),
        formatter,
      };
    }

    if (this.belongTo('timeCat')) {
      const { mask } = this.options;
      const formatter = mask ? (d: Date) => format(d, mask) : (d: Date) => `${d}`;
      const compare = (a: Date, b: Date) => +a - +b;
      return {
        transform: (d: string | Date) => (typeof d === 'string' ? new Date(d) : d),
        formatter,
        compare,
      };
    }

    return {
      transform: (d) => d,
    };
  }

  private calculateTickValues() {
    const { domain } = this.scale.getOptions();
    return 'getTicks' in this.scale ? this.scale.getTicks() : domain;
  }

  private generateDomain(updateOptions: Partial<ScaleDefOptions>) {
    const { min, max, domain } = updateOptions;
    const { transform } = this.getOptions();
    const transformedDomain = domain ? domain.map(transform) : (this.getOption('domain') as []);
    const last = transformedDomain.length - 1;
    if (min) transformedDomain[0] = transform(min);
    if (max) transformedDomain[last] = transform(max);
    return transformedDomain;
  }

  private generateTickMethod() {
    const { tickMethod, ticks, type } = this.options;
    const typeTickMethod = {
      log: d3Log,
      time: d3Time,
    };
    const nameTickMethod = {
      'd3-ticks': d3Ticks,
      'wilkinson-extended': wilkinsonExtended,
      'r-pretty': rPretty,
      'strick-count': strickCount,
      'd3-log': d3Log,
      'd3-time': d3Time,
    };

    if (ticks) return () => ticks;
    if (isFunction(tickMethod)) return tickMethod;
    if (isString(tickMethod) && nameTickMethod[tickMethod]) return nameTickMethod[tickMethod];
    return typeTickMethod[type] || d3Ticks;
  }

  private belongTo(...args: ScaleTypes[]) {
    return args.includes(this.options.type);
  }
}
