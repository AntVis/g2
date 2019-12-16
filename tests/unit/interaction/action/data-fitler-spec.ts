import { Chart, View } from '../../../../src/index';
import DataFilter from '../../../../src/interaction/action/data-filter';
import ElementFilter from '../../../../src/interaction/action/element/filter';

import Context from '../../../../src/interaction/context';
import { createDiv } from '../../../util/dom';

describe('active test', () => {
  const chart = new Chart({
    container: createDiv(),
    width: 400,
    height: 400,
    autoFit: false,
  });
  const data = [
    { year: '1991', value: 13 },
    { year: '1992', value: 34 },
    { year: '1993', value: 5 },
    { year: '1994', value: 34 },
  ];
  chart.data(data);
  // chart.animate(false);
  chart.interaction('legend-visible-filter');

  chart.tooltip(false);
  const interval = chart
    .interval()
    .position('year*value')
    .color('year');
  chart.render();
  const context = new Context(chart);
  const action = new DataFilter(context);
  const visilbeAction = new ElementFilter(context);
  function getLabels() {
    return chart.backgroundGroup.findAll((el) => {
      return el.get('name') === 'axis-label';
    });
  }
  function getLegendItems() {
    return chart.foregroundGroup.findAll((el) => {
      return el.get('name') === 'legend-item';
    });
  }

  it('test filter', () => {
    let label = getLabels()[0];
    let item = label.get('delegateObject').item;
    context.event = {
      target: label,
    };
    action.filter();
    expect(item.unchecked).toBe(undefined);
    expect(interval.elements.length).toBe(data.length);

    label = getLabels()[0];
    item = label.get('delegateObject').item;
    item.unchecked = true;
    context.event = {
      target: label,
    };
    action.filter();
    expect(interval.elements.length).toBe(data.length - 1);
    delete chart.getOptions().filters.year;
    chart.render(true);
    expect(interval.elements.length).toBe(data.length);
  });

  it('legend unchecked', () => {
    const legendItem = getLegendItems()[0];
    const item = legendItem.get('delegateObject').item;
    context.event = {
      target: legendItem,
    };
    item.unchecked = true;
    action.filter();
    expect(interval.elements.length).toBe(data.length - 1);

    delete chart.getOptions().filters.year;
    chart.render(true);
    expect(interval.elements.length).toBe(data.length);
  });

  it('filter visible', () => {
    const label = getLabels()[0];
    const item = label.get('delegateObject').item;
    const elements = interval.elements;
    item.unchecked = true;
    context.event = {
      target: label,
    };
    visilbeAction.filter();
    expect(item.unchecked).toBe(true);
    expect(elements.length).toBe(data.length);
    expect(elements[0].shape.get('visible')).toBe(false);
    item.unchecked = false;
    visilbeAction.filter();
    expect(interval.elements.length).toBe(data.length);
    expect(elements[0].shape.get('visible')).toBe(true);
    item.unchecked = true;
    visilbeAction.filter();

    visilbeAction.clear();
    expect(elements[0].shape.get('visible')).toBe(true);
  });
});
