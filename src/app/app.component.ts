import { SelectionModel } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, Injectable, ViewChild } from '@angular/core';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { BehaviorSubject } from 'rxjs';
import { NotificationsService } from 'angular2-notifications';

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
  require: any[];
  exclude: any[];
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
  require = [];
  exclude = [];
  jsonReglas = [];

  public options = {
      position: ['top', 'right'],
      lastOnBottom: true,
      timeOut: 5000,
      showProgressBar: true,
      pauseOnHover: true,
      clickToClose: true
  };

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

  constructor(private database: ChecklistDatabase,
              private _notificationsService: NotificationsService) {
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

  getRequire = (node: TodoItemFlatNode) => node.require;

  getExclude = (node: TodoItemFlatNode) => node.exclude;

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
    flatNode.require = [];
    flatNode.exclude = [];
    flatNode.disabled = false;
    flatNode.expandable = !!node.children;
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);

    this.aplicarRestricciones(flatNode);
    this.obtenerNodosExclude(flatNode);
    this.obtenerNodosRequire(flatNode);

    return flatNode;
  }

  /**
   * Se aplican las restricciones correspondientes a cada nodo
   * @param node 
   */
  aplicarRestricciones(node: TodoItemFlatNode) {
    this.restricciones.forEach((restriccion) => {
      if ( restriccion['nodo'] === node.item ) {
        node.constraint = restriccion['atributo'];
      }
    });
  }

  /**
   * A partir de los exclude que se tienen registro
   * se obtienen los nodos
   * @param node 
   */
  obtenerNodosExclude(node: TodoItemFlatNode) {
    this.exclude.forEach((exclude) => {
      if ( exclude['origen'] === node.item ) {
        exclude['nodoOrigen'] = node;
      }

      if ( exclude['destino'] === node.item ) {
        exclude['nodoDestino'] = node;
      }

      this.asignarNodosExclude(node, exclude);
    });
  }

  /**
   * Se aplican las restricciones a los nodos correspondientes
   * @param node 
   * @param exclude 
   */
  asignarNodosExclude(node: TodoItemFlatNode, exclude) {
    if ( exclude['nodoOrigen'] && exclude['destino'] === node.item ) {
      node.exclude.push(exclude['nodoOrigen']);
    }

    if ( exclude['nodoDestino'] && exclude['origen'] === node.item ) {
      node.exclude.push(exclude['nodoDestino']);
    }
  }

  /**
   * A partir de los require que se tienen registro
   * se obtienen los nodos
   * @param node
   */
  obtenerNodosRequire(node: TodoItemFlatNode) {
    this.require.forEach((require) => {
      if ( require['origen'] === node.item ) {
        require['nodoOrigen'] = node;
      }

      this.asignarNodosRequire(node, require);
    });
  }

  /**
   * Se aplican las restricciones a los nodos correspondientes
   * @param node 
   * @param require
   */
  asignarNodosRequire(node: TodoItemFlatNode, require) {
    if ( require['nodoOrigen'] && require['destino'] === node.item ) {
      node.require.push(require['nodoOrigen']);
    }
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

  /**
   * Se envia a configurar el JSON, instancia la construiccion de nodos
   * y de restricciones
   */
  configurarJSON() {
    const instancias = JSON.parse(localStorage.getItem('datos'));
    this.construirRestricciones(instancias);

    this.jsonCompleto[instancias[0][0]] = {};

    for ( let i = 1; i < instancias.length; i++ ) {
      this.construir(this.jsonCompleto, instancias[0][0], instancias);
    }
  }

  /**
   * Se construyen las restricciones basica (Optional, Mandatory, etc)
   * Se instancia la construccion de los require y exclude
   * @param instancias 
   */
  construirRestricciones(instancias) {
    for ( let i = 0; i < instancias.length; i++ ) {
      const instancia = {
        nodo: instancias[i][0],
        atributo: instancias[i][2],
        nodoAtributo: instancias[i][3]
      };
      this.restricciones.push(instancia);

      if (instancias[i][5].length !== 0) {
        this.construirRequireOrExclude(instancias[i][5], instancias[i][0]);
      }
    }
  }

  /**
   * Se inicializan y llenan los arreglos require y exclude
   * @param instancias 
   */
  construirRequireOrExclude(instancias, origen) {
    instancias.forEach(instancia => {
      console.log(instancia)
      const json = {
        origen: origen,
        nodo: instancia[0],
        destino: instancia[1],
        nodoAtributo: instancia[2]
      };

      if (json['nodo'] === 'Requires') {
        this.require.push(json);
      } else if (json['nodo'] === 'Excludes') {
        this.exclude.push(json);
      }
    });
  }

  /**
   * Funcion recursiva que permite armar los nodos que tendra el arbol
   * esto lo hace en el formato que necesita Angular Tree
   * @param arrayJson 
   * @param padre 
   * @param instancias 
   */
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

  /**
   * Crea el arbol a partir del json
   * Expande el arbol por defecto
   * Inicia la primera valiacion de mandatory
   */
  crearArbol() {
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
    console.log(nodo)
    /*
    if (nodo.item === 'GPS') {
      console.log(nodo.item);
      console.log(nodo);
      console.log(this.checklistSelection.isSelected(nodo));
    }*/

    this.checklistSelection.toggle(nodo);

    if (nodo.require.length > 0 && this.checklistSelection.isSelected(nodo)) {
      this.seleccionarRequire(nodo.require);
    }

    /*
    if (nodo.item === 'GPS') {
      //console.log(nodo.item);
      //console.log(nodo);
      console.log(this.checklistSelection.isSelected(nodo));
    }*/
    this.checkAllParentsSelection(nodo);
    this.obtenerJSON();
  }

  /**
   * Selecciona los nodos requeridos de otro nodo
   * Se podría dar otra pasada, porque lo que ahora hago
   * es buscar los nodos en el árbol original y comparar
   * con lo guardado en el require, porque los nodos asignado
   * aqui y en exclude por alguna razón cambian y el nodo original
   * no se ajusta, así que tengo que volver a comparar
   * @param requires 
   */
  seleccionarRequire(requires) {
    const nodos = this.tree.treeControl.dataNodes;
    
    requires.forEach(require => {
      nodos.forEach(nodo => {
        if (nodo.item === require.item) {
          console.log(nodo)
          if (nodo.disabled && nodo.constraint === 'XOR') {
            this.validarHermanos(nodo);
            nodo.disabled = false; //Validado aqui, en otra parte puede causar problemas con mandatory
          }

          if (!this.checklistSelection.isSelected(nodo)) {
            this._notificationsService.info('Información', 'Característica ' + nodo.item + ' seleccionada automáticamente');
            this.checklistSelection.select(nodo);
          }
        }
      });
    });
  }

  /**
   * 
   * @param {TodoItemFlatNode} nodo 
   */
  validarHermanos(nodo: TodoItemFlatNode) {
    const padre = this.getParentNode(nodo);
    const hijos = this.treeControl.getDescendants(padre);

    hijos.forEach((hijo) => {
      if (hijo !== nodo && hijo.level === nodo.level && this.checklistSelection.isSelected(hijo)) {
        this._notificationsService.alert('Alerta', 'Se deseleccionó automáticamente la característica ' + hijo.item);
        this.checklistSelection.deselect(hijo);
      }
    });
  }

  /**
   * Si el nodo es de tipo XOR y hay un hermano seleccionado, este se deshabilita
   * @param {TodoItemFlatNode} nodo 
   */
  deshabilitarXOR(nodo: TodoItemFlatNode) {
    if (nodo.constraint === 'XOR' && !this.checklistSelection.isSelected(nodo)) {
      const padre = this.getParentNode(nodo);
      const hijos = this.treeControl.getDescendants(padre);
      nodo.disabled = false;

      for (let i = 0; i < hijos.length; i++) {
        if (hijos[i].level === (nodo.level) && hijos[i] !== nodo
            && this.checklistSelection.isSelected(hijos[i])) {
          nodo.disabled = true;
        }
      }

      return nodo.disabled;
    }
  }

  /**
   * Si es Mandatory en el nivel 1, se deshabilita
   * Si el nodo es Mandatory y su padre está seleccionado, este se deshabilita
   * @param {TodoItemFlatNode} node 
   */
  deshabilitarMandatory(node: TodoItemFlatNode) {
    if (node.level === 1) {
      return node.constraint === 'Mandatory' ? node.disabled = true : node.disabled = false;
    } else {
      const padre = this.getParentNode(node);
      if (this.checklistSelection.isSelected(padre) && node.constraint === 'Mandatory') {
        return node.disabled = true;
      }
    }
  }

  /**
   * Si el padre de un nodo tiene el atributo disabled en true
   * y no está seleccionado, entonces el nodo hijo se deshabilita
   * @param {TodoItemFlatNode} node 
   */
  deshabilitarNodo(node: TodoItemFlatNode) {
    const padre = this.getParentNode(node);
    return (padre.disabled && !this.checklistSelection.isSelected(padre))
          ? node.disabled = true : node.disabled = false;
  }

  /**
   * Si el nodo tiene un arreglo de exclude, se verifican que esos nodos esten
   * o no seleccionados. Si estan seleccionados se bloquea el nodo que verificamos
   * y si no, no se bloquea
   * @param node 
   */
  deshabilitarNodoExclude(node: TodoItemFlatNode) {
    let deshabilitar = false;
    
    node.exclude.forEach(nodo => {
      if (this.checklistSelection.isSelected(nodo) && !this.checklistSelection.isSelected(node)) {
        deshabilitar = true;
      }
    });

    return node.disabled = deshabilitar;
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