import { SelectionModel } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, Injectable, ViewChild } from '@angular/core';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { BehaviorSubject } from 'rxjs';

declare var buildJson: any;
/**
 * Node for to-do item
 */
export class TodoItemNode {
  children: TodoItemNode[];
  item: string;
}

/** Flat to-do item node with expandable and level information */
export class TodoItemFlatNode {
  item: string;
  level: number;
  expandable: boolean;
  constraint: string;
  disabled: boolean;
}

/**
 * The Json object for to-do list data.
 */
const TREE_DATA = {};

/**
 * Checklist database, it can build a tree structured Json object.
 * Each node in Json object represents a to-do item or a category.
 * If a node is a category, it has children items and new items can be added under the category.
 */
@Injectable()
export class ChecklistDatabase {
  dataChange = new BehaviorSubject<TodoItemNode[]>([]);

  get data(): TodoItemNode[] { return this.dataChange.value; }
  set data(value: TodoItemNode[]) {
    //this.treeControl.dataNodes = value;
    this.dataChange.next(value);
  }
  constructor() {
    this.initialize();
  }

  initialize() {
    // Build the tree nodes from Json object. The result is a list of `TodoItemNode` with nested
    //     file node as children.
    const data = this.buildFileTree(TREE_DATA, 0);

    // Notify the change.
    this.dataChange.next(data);
  }

  /**
   * Build the file structure tree. The `value` is the Json object, or a sub-tree of a Json object.
   * The return value is the list of `TodoItemNode`.
   */
  buildFileTree(obj: {[key: string]: any}, level: number): TodoItemNode[] {
    return Object.keys(obj).reduce<TodoItemNode[]>((accumulator, key) => {
      const value = obj[key];
      const node = new TodoItemNode();
      node.item = key;

      if (value != null) {
        if (typeof value === 'object') {
          node.children = this.buildFileTree(value, level + 1);
        } else {
          node.item = value;
        }
      }

      return accumulator.concat(node);
    }, []);
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [ChecklistDatabase]
})
export class AppComponent {
  title = 'Propuesta de modelos de configuración';
  jsonCompleto = {};
  restricciones = [];
  jsonReglas = [];

  @ViewChild('tree') tree;
  
  /** Map from flat node to nested node. This helps us finding the nested node to be modified */
  flatNodeMap = new Map<TodoItemFlatNode, TodoItemNode>();

  /** Map from nested node to flattened node. This helps us to keep the same object for selection */
  nestedNodeMap = new Map<TodoItemNode, TodoItemFlatNode>();

  /** A selected parent node to be inserted */
  selectedParent: TodoItemFlatNode | null = null;

  treeControl: FlatTreeControl<TodoItemFlatNode>;

  treeFlattener: MatTreeFlattener<TodoItemNode, TodoItemFlatNode>;

  dataSource: MatTreeFlatDataSource<TodoItemNode, TodoItemFlatNode>;

  /** The selection for checklist */
  checklistSelection = new SelectionModel<TodoItemFlatNode>(true /* multiple */);

  constructor(private database: ChecklistDatabase) {
    this.treeFlattener = new MatTreeFlattener(this.transformer, this.getLevel,
    this.isExpandable, this.getChildren);
    this.treeControl = new FlatTreeControl<TodoItemFlatNode>(this.getLevel, this.isExpandable);
    this.dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

    database.dataChange.subscribe(data => {
      this.dataSource.data = data;
    });
  }

  onClick() {
    buildJson();
    this.configurarJSON();
  }

  getLevel = (node: TodoItemFlatNode) => node.level;

  getConstraint = (node: TodoItemFlatNode) => node.constraint;

  getDisabled = (node: TodoItemFlatNode) => node.disabled;

  isExpandable = (node: TodoItemFlatNode) => node.expandable;

  getChildren = (node: TodoItemNode): TodoItemNode[] => node.children;

  hasChild = (_: number, _nodeData: TodoItemFlatNode) => _nodeData.expandable;

  hasNoContent = (_: number, _nodeData: TodoItemFlatNode) => _nodeData.item === '';

  /**
   * Transformer to convert nested node to flat node. Record the nodes in maps for later use.
   */

  transformer = (node: TodoItemNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node);
    const flatNode = existingNode && existingNode.item === node.item
        ? existingNode
        : new TodoItemFlatNode();
    flatNode.item = node.item;
    flatNode.level = level;
    flatNode.constraint = null;
    flatNode.disabled = false;
    flatNode.expandable = !!node.children;
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);
     
    this.aplicarRestricciones(flatNode);

    return flatNode;
  }

  aplicarRestricciones(node: TodoItemFlatNode) {
    this.restricciones.forEach((restriccion) => {
      if ( restriccion['nodo'] === node.item ) {
        node.constraint = restriccion['atributo'];
      }
    });
  }

  /**
   * Al seleccionar un hijo, los padres deben seleccionarse
   * de manera automática
   */
  checkAllParentsSelection(node: TodoItemFlatNode): void {
    let parent: TodoItemFlatNode | null = this.getParentNode(node);

    while (parent) {
      this.checklistSelection.select(parent);
      parent = this.getParentNode(parent);
    }
  }

  /**
   * Obtiene el padre directo de un nodo
   */
  getParentNode(node: TodoItemFlatNode): TodoItemFlatNode | null {
    const currentLevel = this.getLevel(node);

    if (currentLevel < 1) {
      return null;
    }

    const startIndex = this.treeControl.dataNodes.indexOf(node) - 1;

    for (let i = startIndex; i >= 0; i--) {
      const currentNode = this.treeControl.dataNodes[i];

      if (this.getLevel(currentNode) < currentLevel) {
        return currentNode;
      }
    }
    return null;
  }

  configurarJSON() {
    const instancias = JSON.parse(localStorage.getItem('datos'));
    this.construirRestricciones(instancias);

    this.jsonCompleto[instancias[0][0]] = {};

    for ( let i = 1; i < instancias.length; i++ ) {
      this.construir(this.jsonCompleto, instancias[0][0], instancias);
    }
  }

  construirRestricciones(instancias) {
    for ( let i = 0; i < instancias.length; i++ ) {
      const instancia = {
        nodo: instancias[i][0],
        atributo: instancias[i][2],
        nodoAtributo: instancias[i][3] 
      }
      this.restricciones.push(instancia);
    }
  }

  construir(arrayJson, padre, instancias) {
    const indices = [];

    for ( let i = 1; i < instancias.length; i++ ) {
      if ( instancias[i][3] && padre === instancias[i][3] ) {
        arrayJson[padre][instancias[i][0]] = {};
        indices.push(i);
      }  
    }

    if ( indices.length === 0 ) {
      arrayJson[padre] = null;
    }

    for ( let j = 0; j < indices.length; j++ ) {
      this.construir(arrayJson[padre], instancias[indices[j]][0], instancias);
    }
    
    this.crearArbol();
  }

  crearArbol(){
    const data = this.database.buildFileTree(this.jsonCompleto, 0);
    
    // Notify the change.
    this.database.dataChange.next(data);
    this.tree.treeControl.expandAll();
    this.validacionInicial(0);
  }

  /**
   * Cambia el estado de un nodo
   * Si es false pasa a true y al revés
   * Valida los nodos y actualiza
   * 
   * @param {TodoItemFlatNode} nodo 
   */
  seleccionarNodo(nodo: TodoItemFlatNode) {
    this.checklistSelection.toggle(nodo);
    
    //this.validarChecks(nodo);
    this.checkAllParentsSelection(nodo);
    this.validacionInicial(0);
    this.obtenerJSON();
  }

  deshabilitarXOR(nodo: TodoItemFlatNode) {
    if (nodo.constraint === 'XOR' && !this.checklistSelection.isSelected(nodo)) {
      const padre = this.getParentNode(nodo);
      const hijos = this.treeControl.getDescendants(padre);
      nodo.disabled = false;
      
      for (let i = 0; i < hijos.length; i++) {
        if (hijos[i].level === (nodo.level) && hijos[i] !== nodo
            && this.checklistSelection.isSelected(hijos[i])) {
          console.log("entre aquí")
          hijos[i].disabled = true;
          nodo.disabled = true;
        }
      }

      return nodo.disabled;
    } else {
      //return nodo.disabled = false;
    }
  }

  deshabilitarMandatory(node: TodoItemFlatNode) {
    if (node.level === 1) {
      return node.constraint === 'Mandatory' ? node.disabled = true : node.disabled = false;
    } else {
      const padre = this.getParentNode(node);
      if (this.checklistSelection.isSelected(padre) && node.constraint === 'Mandatory') {
        return node.disabled = true;
      } else {
        //return node.disabled = false;
      }
    }
  }

  deshabilitarNodo(node: TodoItemFlatNode) {
    const padre = this.getParentNode(node);
    
    if (padre.item === "High Res") {
      console.log(padre)
    }
    if (padre.disabled && !this.checklistSelection.isSelected(padre)) {
      console.log(node)
      return node.disabled = true;
    } else {
      
      return node.disabled = false;
    }
  }

  /**
   * Obtiene un JSON inicial a partir de los nodos
   */
  obtenerJSON() {
    const nodos = this.tree.treeControl.dataNodes;
    this.jsonReglas = [];
    nodos.forEach(nodo => {
      const objeto = {
        'feature' : nodo.item,
        'selected': this.checklistSelection.isSelected(nodo)
      }
      this.jsonReglas.push(objeto);
    });
  }

  /**
   * Realiza una validación completa del árbol
   * en busca de los Mandatory
   * También valida la deselección de los nodos
   * @param {number} level 
   * @param dataNodes 
   * @param padre 
   */
  validacionInicial(level: number, dataNodes?: any, padre?: any) {
    let nodosBase;
    if (dataNodes) {
      nodosBase = dataNodes;
    } else {
      nodosBase = this.tree.treeControl.dataNodes;
    }
    
    nodosBase.forEach(nodo => {
      let padreFlag = false;
      this.deshabilitarMandatory(nodo);
      
      if (nodo.level < 2 || this.checklistSelection.isSelected(nodo) || padre) {
        const father = this.getParentNode(nodo);

        if (this.checklistSelection.isSelected(father) || nodo.level === 1) {
          if (nodo.constraint === 'Mandatory' && nodo.level === level) {
            this.checklistSelection.select(nodo);
            padreFlag = true;
          }
          
          if (this.checklistSelection.isSelected(nodo)) {
            padreFlag = true;
          }
        } else {
          this.checklistSelection.deselect(nodo);
        }
        
        this.validacionInicial(level + 1, this.treeControl.getDescendants(nodo), padreFlag);
      }
    });
  }
}