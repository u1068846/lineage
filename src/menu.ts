import * as events from 'phovea_core/src/event';
import { select, selectAll } from 'd3-selection';
import { keys } from 'd3-collection';

import { Config } from './config';


import {
  scaleLinear,
} from 'd3-scale';

import {
  max,
  min
} from 'd3-array';

import {
  selection,
  mouse,
  event
} from 'd3-selection';

import {
  json
} from 'd3-request';

import {
  PATHWAY_SELECTED
} from './tableManager';


/**
 * Creates the menu
 */
class Menu {

  private $node;

  constructor(parent: Element = undefined) {
    // this.$node = select(parent);
  }

  /**
   * Initialize the view and return a promise
   * that is resolved as soon the view is completely initialized.
   * @returns {Promise<Menu>}
   */
  init() {

    // return the promise directly as long there is no dynamical data to update
    return Promise.resolve(this);
  }

  private clearMenus() {
    //remove any menus
    select('#treeMenu').select('.menu').remove();

          //set all nodes back to opacity 1
          select('.nodes')
          .selectAll('.title')
          .style('opacity',1);

          //remove any tooltips
          select('#tooltipMenu')
          .select('svg').remove();

          //clear all pathways
          selectAll('.edge')
          .classed('pathway', false)
          .classed('fadeEdge',false);

          select('#nodeGroup').selectAll('.title')
          .classed('fadeNode',false);

          select('#nodeGroup').selectAll('.addIcon')
          .classed('fadeNode', false);

          selectAll('.edge').classed('selectedPathway', false);

          select('#nodeGroup').selectAll('.title')
          .classed('pathwayEndpoint', false);

          selectAll('.selectedPathItem').classed('selectedPathItem', false);

          select('.open').style('visibility','hidden');
          selectAll('.hiddenEdge').attr('visibility', 'hidden');

          events.fire(PATHWAY_SELECTED, { 'clear': true });
 }

public addMenu(data, actions = null) {

  //  select('#app').on('click',()=> {
  //   select('#treeMenu').select('.menu').remove();
  //  });

    select('#treeMenu').select('.menu').remove();

    event.stopPropagation();

    const container = document.getElementById('app');
    const coordinates = mouse(container);

    let menuWidth = 90;
    const menuItemHeight = 25;
    const menuHeight = 5 + actions.length * menuItemHeight;

    const menu = select('#treeMenu')
      .append('svg')
      .attr('class', 'menu')
      .attr('height', menuHeight)
      .attr('transform', 'translate(' + (coordinates[0]) + ',' + (coordinates[1] - menuHeight / 2) + ')')
      .append('g')
      .attr('id','menuGroup')
      .attr('transform', 'translate(10,0)');

      select('#treeMenu')
      .select('#menuGroup')
      .append('g')
      .attr('class','tooltipTriangle')
      .append('rect');

    let menuItems = menu.selectAll('text').data(actions);

    const menuItemsEnter = menuItems.enter()
      .append('g').attr('class', 'menuItem');

    menuItemsEnter.append('rect').classed('menuItemBackground', true);
    menuItemsEnter.append('text').classed('icon', true);
    menuItemsEnter.append('text').classed('label', true);
    menuItemsEnter.append('line').classed('menuDivider', true);

    menuItems = menuItemsEnter.merge(menuItems);

      menuItems
      .select('.label')
      .attr('x', 10)
      .attr('y', menuItemHeight / 2)
      // .attr('alignment-baseline','central')
      .text((d: any) => d.string)
      .classed('tooltipTitle', true);

      let longestLabelLength = 0;

          menu.selectAll('.menuItem').each(function (element: any, i) {
            const textNode = <SVGTSpanElement>select(this).select('.label').node();
            const labelWidth = textNode.getComputedTextLength();
            longestLabelLength = (labelWidth > longestLabelLength) ? labelWidth : longestLabelLength;
          });

      menuWidth = longestLabelLength + 50;

      menuItems.select('.menuItemBackground')
      .attr('width', menuWidth)
      .attr('fill', '#f7f7f7')
      .attr('height', menuItemHeight)
      .attr('opacity', 1)
      .on('click', (d: any) => {
        event.stopPropagation();
        d.callback();
        select('#treeMenu').select('.menu').remove();
        this.clearMenus();
      });



    select('.tooltipTriangle')
      // .attr('transform', 'translate(-5,' + (menuItemHeight*actions.length/2 -1) + ')')
      .select('rect')
      .attr('width', 10)
      .attr('fill', '#909090')
      .attr('height', 10)
      .attr('opacity', 1)
      .attr('transform', 'translate(0,' + (menuItemHeight*actions.length/2 -1) + ')' + ' rotate(45)');
      // .attr('transform-origin', 'center');


    menuItems.attr('transform', ((d, i) => { return 'translate(0,' + (5 + i * menuItemHeight) + ')'; }));

    menuItems
      .select('.icon')
      .attr('x', menuWidth - 20)
      .attr('y', menuItemHeight / 2)
      .attr('class', 'icon')
      .text((d: any) => { return Config.icons[d.icon];})
      .classed('tooltipTitle', true);

    menuItems
      .select('.menuDivider')
      .attr('x1', 0)
      .attr('x2', menuWidth)
      .attr('y1', menuItemHeight)
      .attr('y2', menuItemHeight)
      .attr('stroke-width', '1px')
      .attr('stroke', 'white');

    select('#treeMenu')
      .attr('width', menuWidth);

    menu.append('line')
      .attr('x1', 0)
      .attr('x2', menuWidth)
      .attr('y1', 5)
      .attr('y2', 5)
      .attr('stroke-width', '5px')
      .attr('stroke', '#e86c37');
  }

};

/**
 * Factory method to create a new instance of the genealogyTree
 * @param parent
 * @param options
 * @returns {Menu}
 */
export function create() {
  return new Menu();
}
