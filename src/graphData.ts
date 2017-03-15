/**
 * Created by Carolina Nobre on 01.22.2017
 */
/**
 * Data structure for the genealogy graph.
 */
import {
  max,
  min,
  range,
} from 'd3-array';

import * as events from 'phovea_core/src/event';
import * as Range from 'phovea_core/src/range';
import {VIEW_CHANGED_EVENT} from './tableManager';



class GraphData {

  public nodes;
  public graphTable;
  public attributeTable;
  private tableManager;
  private ids; //unique identifier for each person. Is used to create new range on graphView



  //Array of Parent Child Edges
  public parentChildEdges = [];

  //Array of Parent Parent Edges
  public parentParentEdges = [];


  constructor(data) {
    this.graphTable = data.graphTable;
    this.tableManager = data;
    this.setListeners();
  };

  private setListeners(){

  events.on(VIEW_CHANGED_EVENT, () => {
    this.graphTable = this.tableManager.graphTable;

    //Once tree has been created for the new family, fire redraw tree event.
    this.createTree().then(
      () => {events.fire('redraw_tree',this)}
    ).catch(function (error) {
      console.log('Error: ' + error);
    });
  });
}

  /**
   * This function loads genealogy data from lineage-server
   * and builds the genealogy tree
   * @param: name of the dataset
   * returns a promise of table
   *
   */
  public async createTree() {

    this.nodes = [];
    let columns = this.graphTable.cols();
    let nrow = this.graphTable.nrow;

    range(0,nrow,1).forEach(()=>{
      this.nodes.push({});
    });

    this.ids =await columns[0].names();
    this.ids = this.ids.map(Number); //covert array to numbers

      for (let col of columns) {
        let data = await col.data();
        for (let row of range(0, nrow, 1)) {
          let personObj = this.nodes[row];
          personObj['id'] = this.ids[row];
          personObj[col.desc.name] = data[row];
        };
      }

    //Sort nodes by y value, always starting at the founder (largest y) ;
    this.nodes.sort(function (a, b) {
      return b.y - a.y;
    });

    //Initially set all nodes to visible (i.e, not hidden)  and of type 'single' (vs aggregate)
    this.nodes.forEach((d) => {
      d.y = undefined;
      d.x = +d.bdate; //set year as x attribute
      d.type = 'single';
      d.MaID = +d.MaID;
      d.PaID = +d.PaID;
      d.hidden = false;
      d.aggregated = false;
      d.bdate = +d.bdate;
      // d.deceased = d.deceased === 'Y'; //transform to boolean values
      d.generation = -1; //indicator that generation has not been set
      d.descendant = false; //flag for blood descendants of founders - not in use yet (2/23/17)
      d.family_ids = []; //keeps track of nuclear families a given node belongs to.
      d.clicked = false; //used to keep track of clicked nodes even when they are removed from the visible area. May not need if nodes are not removed and simply scroll out of view.
      d.primary = undefined; //Keep track of primary attribute and what 'affected' means for this attribute data.
      d.secondary = undefined; //Keep track of secondary attribute and what 'affected' means for this attribute data.
      //For Tree structure
      d.hasChildren = false;
      d.children = []; //Array of children
      d.spouse = []; //Array of spouses (some have more than one)
      // console.log(d.KindredID)
    });

    //Define attribute that defines 'affected' state
    this.defineAffected(this.tableManager.affectedState);
    this.buildTree();


    //Linearize Tree and pass y values to the attributeData Object
    this.linearizeTree();

    //Create fake birthdays for people w/o a bdate.
    this.nodes.forEach((n)=>{
      if (+n.bdate === 0 ) {//random number
        //subtract 20 from the age of the first kid
        if (n.hasChildren){
          n.bdate = n.children[0].bdate - 20;
          n.x = n.bdate;
        }
      }
    });

    this.exportYValues();


    //Create hashmap of personID to y value;
    let dict = {};

    this.nodes.forEach((node) => {
      //console.log(node.id, node.y)
      dict[node.id] = node.y;
    })

    //Assign y values to the tableManager object
    this.tableManager.ys = dict;


  //After linear order has been computed:
    this.nodes.forEach((d)=> {
      d.Y = +d.y; //keeps track of nodes original y position
      d.X = +d.x; //keeps track of nodes original x position - can change for kid grids on hide.
    });
  };


  /**
   *
   * This function get the requested attribute from the tableManager (primary or secondary only) for the person requested.
   * Returns undefined if there is no value or if the requested attribute is not the primary or secondary.
   *
   * @param attribute - attribute to search for
   * @param personID - person for which to search for attribute
   */
  private getAttribute(attribute, personID){
    return this.tableManager.getAttribute(attribute,personID);
  }

  /**
   *
   * This function uncollapses the entire tree
   *
   */
  private uncollapseAll(){

    //Iterate through branch, if there are hidden nodes, uncollapse
    const isHidden = this.nodes.filter((node) => {
      return (node.hidden);
    });

    if (isHidden.length === 0) {
      return;
    }

    //Find oldest person in this set of nodes and set as startingPoint
    let startNode = isHidden.reduce((a,b)=> {return +a.bdate < +b.bdate? a : b});
    this.expandBranch(startNode);

    //Recursively call uncollapseAll to handle any branches that were not uncollapsed.
    this.uncollapseAll();
  }

  /**
   *
   * This function collapses the entire tree (using aggregation, not hiding)
   *
   */

  private collapseAll() {

    //Iterate through branch, if there are any unhidden nodes, collapse
    const isNotHidden = this.nodes.filter((node) => {
      return (!node.hidden || !node.affected);
    });

    if (isNotHidden.length === 0) {
      return;
    }

    //Find oldest person in this set of nodes and set as startingPoint
    let startNode = isNotHidden.reduce((a,b)=> {return +a.bdate < +b.bdate? a : b});
    this.hideNodes(startNode.y,true);

    //Recursively call collapseAll to handle any branches that were not collapsed.
    // this.collapseAll();
  }


  /**
   *
   * This function passes the newly computed y values to the tableManager
   *
   */
  private exportYValues() {

    //Create hashmap of personID to y value;
    let dict = {};

    this.nodes.forEach((node) => {dict[node.id] = Math.round(node.y);})



    //Assign y values to the tableManager object
    this.tableManager.yValues = dict;
  }

  /**
   *
   * This function linearizes all nodes in the tree.
   *
   */
  private linearizeTree(){
    //Only look at nodes who have not yet been assigned a y value
    let nodeList = this.nodes.filter((n)=>{return n.y === undefined});
    if (nodeList.length === 0)
      return;

    //Find oldest person in this set of nodes and set as founder
    let founder = nodeList.reduce((a,b)=> {return +a.bdate < +b.bdate? a : b});
    founder.y = nodeList.length; //Set first y index;
    this.linearizeHelper(founder);

    //Recursively call linearizeTree to handle any nodes that were not assigned a y value.
    this.linearizeTree();
  }

  /**
   *
   * This is a recursive helper function for linearizeTree()
   * @param node - node at the start of branch that needs to be linearized;
   *
   */
  private linearizeHelper(node){
    if (node.y == undefined)
      node.y = min(this.nodes,(n:any)=>{return n.y})+(-1);

    //sort children by age to minimize edge crossings
    node.children.sort((a,b)=>{return b.bdate - a.bdate});

    //Assign y position of all spouses.
    if (node.spouse.length>0)
    // node.spouse[0].y = min(this.nodes,(n:any)=>{return n.y})+(-1)
    node.spouse.forEach((s)=>{
      if (s.y === undefined){
        s.y = min(this.nodes,(n:any)=>{return n.y})+(-1)
      }
      s.spouse.forEach((ss)=>{
        if (ss.y === undefined){
          ss.y = min(this.nodes,(n:any)=>{return n.y})+(-1)
        }
      })
    });

    //If person has two spouses, put this one in the middle.
    if (node.spouse.length === 2){
      let ys = [node.y].concat(node.spouse.map((s)=>{return s.y}));
      ys.sort();
      node.y = ys[1]; node.spouse[0].y = ys[0]; node.spouse[1].y = ys[2];
    }

    node.children
      // .filter((c)=>{return (c.ma === node && c.pa === s) || (c.pa === node && c.ma === s)})
      .map((c:any) => {this.linearizeHelper(c)})

    node.spouse.forEach((s)=>{
      s.spouse.forEach((ss)=> {
        //sort children by age to minimize edge crossings
        s.children.sort((a,b)=>{return b.bdate - a.bdate});
        s.children
          .filter((c)=>{return (c.ma === ss && c.pa === s) || (c.pa === ss && c.ma === s)})
          .map((c:any) => {this.linearizeHelper(c)});
      })
    });

    //Base case are leaf nodes. Reached end of this branch.
    if(!node.hasChildren){
      return;
    }
  }


  /**
   *
   * This function defined the 'affected' state based on a user defined attribute.
   *
   * @param attribute attribute to be used to define 'affected' state of nodes.
   * @param value threshold value to apply to attribute when defining 'affected'.
   * Currently has a single value that indicates true.
   */
  private definePrimary(primary_secondary) {


  }

  /**
   *
   * This function defined the 'affected' state based on a user defined attribute.
   *
   * @param attribute attribute to be used to define 'affected' state of nodes.
   * @param value threshold value to apply to attribute when defining 'affected'.
   * Currently has a single value that indicates true.
   */
  private defineAffected(affectedState) {

    this.nodes.forEach((node) => {
      node.affected = affectedState.isAffected(node[affectedState.name]);
    });

  }


  /**
   *
   * This function defined the 'secondary attribute' state based on a user defined attribute.
   *
   * @param attribute attribute to be used to define 'affected' state of nodes.
   * @param value threshold value to apply to attribute when defining 'affected'.
   * Currently has a single value that indicates true.
   */
  private defineSecondary(attribute, value) {
    this.nodes.forEach((node) => {
      node.secondary = {'Attribute': attribute, 'Threshold': value};
      node.affected = node[attribute] === value;
    });

  }


  /**
   *
   * This function creates edges objects and adds the references between parents and children to create a tree.
   * It creates two types of edges:
   * 1) between parents and their children -> parent child edges.
   * 2) between couples -> parent parent edges
   *
   * It populates the class attributes parentParentEdges and parentChildEdges.
   */

  private buildTree() {

    this.parentChildEdges=[];
    this.parentParentEdges=[];

    this.nodes
      .forEach((node) => {
        //Check if there are mother and father nodes in this family (founder won't have them for example)
        let maNode = this.nodes.filter((d) => {
          return d.id === node.MaID;
        });
        let paNode = this.nodes.filter((d) => {
          return d.id === node.PaID;
        });

        //No parents found
        if (maNode.length === 0 || paNode.length === 0) {
          node.ma = undefined;
          node.pa = undefined;
          // console.log('no parents :( ')
        } else { //If found parents, create edges between parent and children, spouses, and add references to build tree
          // console.log('found parents :) ')
          maNode = maNode[0];
          paNode = paNode[0];

          //Replace ma and pa fields with reference to actual ma/pa nodes
          node.ma = maNode;
          node.pa = paNode;

          //relationship node. Used to build parent child edges
          const rnode = {
            ma: maNode,
            pa: paNode,
            type: 'parent',
            id: Math.random() //Create random id or each parentParent Edge.
          };

          //Only add parent parent Edge if it's not already there;
          if (!this.parentParentEdges.some((d) => {
              return d.ma === rnode.ma && d.pa === rnode.pa;
            })) {
            this.parentParentEdges.push(rnode);

            //Set spouse fields
            maNode.spouse.push(paNode);
            paNode.spouse.push(maNode);
          }

          //Set flag for people with children so they are not placed in the kidGrid
          maNode.hasChildren = true;
          paNode.hasChildren = true;

          //Add child to array of children of each parent
          maNode.children.push(node);
          paNode.children.push(node);


          this.parentChildEdges.push({
            ma: maNode,
            pa: paNode,
            target: node,
            'id': node.id //id of parentChild Edge is the id of the child.
          });
        }
      });

    // console.log(parentChildEdges)
  };

  /**
   *
   * This function traverses down the tree to find the index of the last (upwards) leaf node in a given branch
   *
   * @param node - starting node.
   */
  public findLastLeaf(node) {

    //will have to add case if there are ever leaf nodes with spouses but no children. 2/23/2017
    //Base case -> leaf node w/ no spouse
    if (node.spouse.length === 0 && !node.hasChildren) {
      return node.Y;
    } else {//Search through spouse and all of spouses relationships to find last child leaf
      return min(node.spouse.map((spouse) => {
        return min(spouse.spouse.map((otherSpouse) => {
          return min(otherSpouse.children.map((child) => {
            return this.findLastLeaf(child);
          }));
        }));
      }));
    }
  };

  /**
   *
   * This function hides all the nodes that descend from a given starting point. to the end of that branch.
   *
   * @param startIndex - y value (row number) for the starting point.
   * @param aggregate - boolean flag to indicate whether collapsed nodes should be hidden or aggregated into their own row.
   */
  public hideNodes(startIndex, aggregate) {

    startIndex = Math.round(startIndex)
    let Y: number = startIndex;

    //find all nodes in that row
    const rowNodes = this.nodes.filter((node) => {
      return Math.round(node.y) === startIndex;
    });


    //find the largest original Y value
    let startYIndex: any = max(rowNodes, function (n) {
      return n['Y'];
    });

    //Find the node that has that large Y value
    let startNode = this.nodes.filter((node) => {
      return node.Y === startYIndex;
    })[0];

    //Consider Spouse
    if (startNode.spouse.length > 0) {
      //find the spouses Y values
      let spouseY = startNode.spouse.map((s) => {
        return s.Y;
      });

      startYIndex = max([startYIndex].concat(spouseY));

      //Find the node that has that large Y value
      startNode = this.nodes.filter((node) => {
        return node.Y === startYIndex;
      })[0];

      Y = startNode.y;
    }

    //Returns the Y value of the last leaf node in that branch
    const endIndex: any = this.findLastLeaf(startNode);

    const endNode = this.nodes.filter((n) => {
      return n.Y === endIndex;
    })[0];


    //Iterate through branch, if there are hidden nodes, uncollapse
    const isNotHidden = this.nodes.filter((node) => {
      return (node.Y <= startNode.Y && node.Y >= endIndex && !node.hidden && !node.affected);
    });

    if (isNotHidden.length === 0) {
      this.expandBranch(startNode);
      return;
    }
    ;

    this.nodes.sort((a, b) => {
      return b.Y - a.Y;
    });

    //Assign a row for each affected case within the range to be collapsed;
    this.nodes.filter((node) => {
      return node.Y <= startYIndex && node.Y >= endIndex;
    }).forEach((node, i) => {

      //non affected leaf nodes
      if (!node.hasChildren && !node.affected) {

        const ma = node.ma;
        const pa = node.pa;

        //If both parents are affected
        if (ma.affected && pa.affected) {
          if (!aggregate) { //place kid grid in the middle
            if (node.sex === 'M') {
              node.y = min([ma.y, pa.y]) + 0.3;
            } else {
              node.y = max([ma.y, pa.y]) - 0.3;
            }
          } else { //aggregate mode is on
            if (node.sex === 'M') {
              node.y = Y - 0.2;
            } else {
              node.y = Y + .2;
            }
          }
          //Place node at x position of youngest parent
          node.x = max([ma.x, pa.x]);
        } else if (ma.affected) {//Only mother is affected,
          if (!aggregate) {
            if (node.sex === 'M') {
              node.y = ma.y - 0.2;
            } else {
              node.y = ma.y + .2;
            }
          } else {
            if (node.sex === 'M') {
              node.y = Y - 0.2;
            } else {
              node.y = Y + .2;
            }
          }
          node.x = pa.x; //place kidGrid in front of father icon

        } else if (pa.affected) { //Only father is affected
          if (!aggregate) {
            if (node.sex === 'M') {
              node.y = pa.y - 0.2;
            } else {
              node.y = pa.y + 0.2;
            }
          } else {
            if (node.sex === 'M') {
              node.y = Y - 0.2;
            } else {
              node.y = Y + .2;
            }
          }
          node.x = ma.x; //place kidGrid in front of mother icon
        } else {//Neither parent is affected
          if (node.sex === 'M') {
            node.y = pa.y;
          } else {
            node.y = ma.y;
          }
          node.x = pa.x; //place kid grid in front of father icon since they are both aligned
        }

      } else { //Affected nodes and non-leaf nodes
        //Non-leaf and non-affected nodes
        if (!node.affected) {

          const spouses = node.spouse;

          if (spouses.length > 0) { //they had at least one partner

            const spouse = spouses[0];
            // spouses.map((spouse) => {
            //Affected Spouse
            if (spouse.affected && !aggregate) { //what happens if person has more than one affected spouse? where to place him/her then?
              // node.y = spouse.y;
              if (node.sex === 'M') {
                node.y = spouse.y - 0.2;
              } else {
                node.y = spouse.y + 0.2;
              }
            } else { //Non affected Spouse
              if (node.sex === 'M') {
                node.y = Y - 0.2;
              } else {
                node.y = Y + 0.2;
              }
            }
            // });
          }
        } else { //Affected Nodes
          if (aggregate && i > 0 && !this.nodes[i - 1].affected) {
            Y = Y - 1;
          }
          ;
          node.y = Y;
          const spouses = node.spouse;

          if (spouses.length > 0) {
            const spouse = spouses[0];
            if (!spouse.affected && !aggregate) {
              if (spouse.sex === 'M') {
                spouse.y = Y - 0.2;
              } else {
                spouse.y = Y + 0.2;
              }
              spouse.x = node.x;
            }
          }
        }

        //Place Mom and Dad Nodes on top of Each other (at the dad's x location)
        if (node.sex === 'F' && node.spouse.length > 0 && !node.affected && !node.spouse[0].affected) {
          node.x = node.spouse[0].x; //need to figure out how to handle multi spouse situations 2/23/2017
        }

      }

      if (node.affected) {
        Y = Y - 1;
      } else {
        //Check if you are at the end of a branch w/ only unaffected leaf children.
        const unaffectedLeafChildren = !(node.spouse.reduce((acc, s) => {
          return GraphData.hasAffectedChildren(s) || acc;
        }, false));


        //If current node has only unaffected leaf children and does not have any affected spouses and is not a leaf
        const newBranch = unaffectedLeafChildren && node.hasChildren &&
          node.spouse.reduce((acc, spouse) => {
            return acc && !spouse.affected;
          }, true)
          && node.Y < max(node.spouse.map((s) => {
            return s.Y;
          }));

        if (newBranch) {
          Y = Y - 1;
        }

        node.hidden = true;
        node.aggregated = aggregate; //set aggregate status according to input parameter of to aggregate (true) or not (false);
      }
    });

    this.trimTree();

    let id_range = [];
    this.nodes.forEach((n: any) => {
     if (!(!n.aggregated && n.hidden)){
        let ind: number = this.ids.indexOf(n.id);
        id_range.push(ind);
      }
    });

    this.exportYValues();
    this.tableManager.activeGraphRows = Range.list(id_range)
  };

  /**
   *
   * This function removes white rows from the tree.
   */
  private trimTree() {
    let toCollapse = 0;
    range(1, this.nodes.length, 1).forEach((y) => {

      //find any nodes that are in that row
      const rowNodes = this.nodes.filter((d) => {
        return Math.round(d.y) === y;
      }).length;

      if (rowNodes < 1) { //found an empty Row
        toCollapse = toCollapse + 1;
      } else if (toCollapse>0) {
        this.nodes.forEach((node) => {
          if (Math.round(node.y) >= y) {
            node.y = node.y - toCollapse;

          }
        });
        toCollapse = 0;
      }
      ;
    });
  };


  /**
   *
   * This function uncollapses a branch from a given starting node.
   *
   * @param startNode - startingNode.
   *
   */
  private expandBranch(startNode) {

    let endIndex = this.findLastLeaf(startNode);
    let endNode;

    let startIndex = startNode['Y'];

    let toUncollapse = this.nodes.filter((node) => {
      return node.Y <= startIndex && node.Y >= endIndex;
    });

    let numRows = toUncollapse.length -1;
    const ind = 1000;

    toUncollapse.forEach((n) => {
      if (n['Y'] < ind) {
        endNode = n;
      }
    });

    let ydiff = Math.round(endNode['Y']-endNode['y']);

    this.nodes.forEach((node) => {
      if (node['Y'] > startIndex) {
        node['y'] = node['y'] + numRows;
      } else if (node['Y'] >= endIndex) {
        node['y'] = node['Y'] - ydiff;
        node['x'] = node['X'];
        node['hidden'] = false;
        node['aggregated']=false;
      }
    });

    this.trimTree();

    let new_range = [];
    this.nodes.forEach((n: any) => {
      if (n.aggregated || !n.hidden ) {
        let ind: number = this.ids.indexOf(n.id);
        new_range.push(ind);
      };
    });

    this.exportYValues();
    this.tableManager.activeGraphRows = Range.list(new_range)

  };

  /**
   *
   * This function returns true if this node has any affected leaf children.
   *
   * @param node to query
   * @return true/false indicating whether this node has any affected leaf children
   */
  static hasAffectedChildren(node) {

    return !node.children.reduce((acc, child) => {
      return acc && !child.affected && !child.hasChildren;
    }, true);
  }

}

/**
 * Method to create a new graphData instance
 * @param data
 * @returns {GraphData}
 */
export function create(data) {
  return new GraphData(data);
}
