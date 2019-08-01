import { SelectionModel } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, Injectable, ViewChild } from '@angular/core';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { BehaviorSubject } from 'rxjs';
import { NgxXml2jsonService } from 'ngx-xml2json';

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
}

/**
 * The Json object for to-do list data.
 */
const TREE_DATA = {
  Groceries: {
    'Almond Meal flour': null,
    'Organic eggs': null,
    'Protein Powder': null,
    Fruits: {
      Apple: null,
      Berries: ['Blueberry', 'Raspberry'],
      Orange: null
    }
  },
  Reminders: [
    'Cook dinner',
    'Read the Material Design spec',
    'Upgrade Application to Angular'
  ]
};

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
    //console.log(obj)
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

  /** Add an item to to-do list */
  insertItem(parent: TodoItemNode, name: string) {
    if (parent.children) {
      parent.children.push({item: name} as TodoItemNode);
      this.dataChange.next(this.data);
    }
  }

  updateItem(node: TodoItemNode, name: string) {
    node.item = name;
    this.dataChange.next(this.data);
  }

  changeCompleteTree(data) {
    this.dataChange.next(data);
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [ChecklistDatabase]
})
export class AppComponent {
  title = 'ConfigurationModel';
  jsonGenerado: any;
  jsonCompleto = {};

  @ViewChild('jsonFeature') jsonFeature: any;
  //xml = `<note><to>User</to><from>Library</from><heading>Message</heading><body>Some XML to convert to JSON!</body></note>`;

  public xml = '';
  public formulario = true;

  /** Map from flat node to nested node. This helps us finding the nested node to be modified */
  flatNodeMap = new Map<TodoItemFlatNode, TodoItemNode>();

  /** Map from nested node to flattened node. This helps us to keep the same object for selection */
  nestedNodeMap = new Map<TodoItemNode, TodoItemFlatNode>();

  /** A selected parent node to be inserted */
  selectedParent: TodoItemFlatNode | null = null;

  /** The new item's name */
  newItemName = '';

  treeControl: FlatTreeControl<TodoItemFlatNode>;

  treeFlattener: MatTreeFlattener<TodoItemNode, TodoItemFlatNode>;

  dataSource: MatTreeFlatDataSource<TodoItemNode, TodoItemFlatNode>;

  /** The selection for checklist */
  checklistSelection = new SelectionModel<TodoItemFlatNode>(true /* multiple */);

  constructor(private ngxXml2jsonService: NgxXml2jsonService,
              private database: ChecklistDatabase) {
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
    this.jsonGenerado = JSON.parse(this.jsonFeature.nativeElement.value);
    this.configurarJSON();
  }

  getLevel = (node: TodoItemFlatNode) => node.level;

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
    flatNode.expandable = !!node.children;
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);
    return flatNode;
  }

  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: TodoItemFlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    return descAllSelected;
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: TodoItemFlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const result = descendants.some(child => this.checklistSelection.isSelected(child));
    return result && !this.descendantsAllSelected(node);
  }

  /** Toggle the to-do item selection. Select/deselect all the descendants node */
  todoItemSelectionToggle(node: TodoItemFlatNode): void {
    this.checklistSelection.toggle(node);
    const descendants = this.treeControl.getDescendants(node);
    this.checklistSelection.isSelected(node)
      ? this.checklistSelection.select(...descendants)
      : this.checklistSelection.deselect(...descendants);

    // Force update for the parent
    descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    this.checkAllParentsSelection(node);
  }

  /** Toggle a leaf to-do item selection. Check all the parents to see if they changed */
  todoLeafItemSelectionToggle(node: TodoItemFlatNode): void {
    this.checklistSelection.toggle(node);
    this.checkAllParentsSelection(node);
  }

  /* Checks all the parents when a leaf node is selected/unselected */
  checkAllParentsSelection(node: TodoItemFlatNode): void {
    let parent: TodoItemFlatNode | null = this.getParentNode(node);
    while (parent) {
      this.checkRootNodeSelection(parent);
      parent = this.getParentNode(parent);
    }
  }

  /** Check root node checked state and change it accordingly */
  checkRootNodeSelection(node: TodoItemFlatNode): void {
    const nodeSelected = this.checklistSelection.isSelected(node);
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    if (nodeSelected && !descAllSelected) {
      this.checklistSelection.deselect(node);
    } else if (!nodeSelected && descAllSelected) {
      this.checklistSelection.select(node);
    }
  }

  /* Get the parent node of a node */
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

  /** Select the category so we can insert the new item. */
  addNewItem(node: TodoItemFlatNode) {
    const parentNode = this.flatNodeMap.get(node);
    this.database.insertItem(parentNode!, '');
    this.treeControl.expand(node);
  }

  /** Save the node to database */
  saveNode(node: TodoItemFlatNode, itemValue: string) {
    const nestedNode = this.flatNodeMap.get(node);
    this.database.updateItem(nestedNode!, itemValue);
  }

  /*
  const TREE_DATA = {
  Groceries: {
    'Almond Meal flour': null,
    'Organic eggs': null,
    'Protein Powder': null,
    Fruits: {
      Apple: null,
      Berries: ['Blueberry', 'Raspberry'],
      Orange: null
    }
  },
  Reminders: [
    'Cook dinner',
    'Read the Material Design spec',
    'Upgrade Application to Angular'
  ]
};
  */
  configurarJSON() {
    let instancias = JSON.parse(localStorage.getItem('datos'));
    console.log(instancias)

    this.jsonCompleto[instancias[0][0]] = {};

    for ( let i = 1; i < instancias.length; i++ ) {
      this.construir(this.jsonCompleto, instancias[0][0], instancias);
    }

    /*
    instancias.forEach((instancia, index) => {
      console.log(index)
      if ( !instancia[2] && index === 0 ) {
        jsonCompleto[instancia[0]] = {};
      } else {
        let tienePadre = false;
        for (let key in jsonCompleto) {
          console.log(key)
          console.log(jsonCompleto[key])
          if ( key === instancia[3] ) {
            tienePadre = true;
          }
        }

        if ( tienePadre ) {
          jsonCompleto[instancia[3]][instancia[0]] = {}; 
        } else {
          jsonCompleto[instancia[0]] = {};
        } 
      }
    });

    console.log(jsonCompleto)
    
    this.jsonGenerado.ADOXML.MODELS.MODEL.INSTANCE.forEach((instancia) => {
      instancia.id = parseInt(instancia._id.split('.')[1])
      instancia.padre = parseInt(instancia.ATTRIBUTE[4].__text);
    });
    let json = {};
    json[this.jsonGenerado.ADOXML.MODELS.MODEL.INSTANCE[0]._name] = {};
    this.construirArbol(this.jsonGenerado.ADOXML.MODELS.MODEL.INSTANCE,
                        json,
                        this.jsonGenerado.ADOXML.MODELS.MODEL.INSTANCE[0]._name,
                        this.jsonGenerado.ADOXML.MODELS.MODEL.INSTANCE[0].id);    
    */
  }

  construir(arrayJson, padre, instancias) {
    let indices = [];

    for ( let i = 1; i < instancias.length; i++ ) {
      if ( instancias[i][3] && padre === instancias[i][3] ) {
        console.log(arrayJson)
        console.log(padre)
        console.log(instancias[i][0])
        arrayJson[padre][instancias[i][0]] = {};
        indices.push(i);
      }  
    }

    for ( let j = 0; j < indices.length; j++ ) {
      this.construir(arrayJson[padre], instancias[indices[j]][0], instancias);  
    }
    
    console.log(arrayJson)
    const data = this.database.buildFileTree(this.jsonCompleto, 0);
    // Notify the change.
    this.database.dataChange.next(data);
  }

  construirArbol(arrayJson, json, nombre, id) {
    //json[nombre] = {};
    let existe: boolean = false;
    let arreglo = [];
    arrayJson.forEach((instancia) => {
      if (instancia._name === "Camera" || instancia._name === "Media" || instancia._name === "MP3") {
        console.log(instancia)
       
      }
       if (!instancia.padre) {
        console.log(instancia._name)
      }
      if (instancia.padre === id) {
        existe = true;
        json[nombre][instancia._name] = {};
        arreglo.push({
          nombre: instancia._name,
          id: instancia.id
        })
        this.construirArbol(arrayJson, json[nombre], instancia._name, instancia.id);
      }  
    });

    if (!existe) {
      json[nombre] = null;
    }
    
    console.log(json)
    // Mostrar árbol
    const data = this.database.buildFileTree(json, 0);
    // Notify the change.
    this.database.dataChange.next(data);
  }

  /*
  openFile(event) {
  	let input = event; // Remove: .target;
    console.log(input)

    let fileList = event.target.files;
    console.log(fileList)
    
    const parser = new DOMParser();
    const xml = parser.parseFromString(this.xml, 'text/xml');
    const obj = this.ngxXml2jsonService.xmlToJson(xml);
    console.log(obj);
    /*
    if(fileList.length > 0) {
        let file: File = fileList[0];
        let formData:FormData = new FormData();
        formData.append('uploadFile', file, file.name);
        let headers = new Headers();
        /** In Angular 5, including the header Content-Type can invalidate your request
        headers.append('Content-Type', 'multipart/form-data');
        headers.append('Accept', 'application/json');
        let options = new RequestOptions({ headers: headers });
        this.http.post(`${this.apiEndPoint}`, formData, options)
            .map(res => res.json())
            .catch(error => Observable.throw(error))
            .subscribe(
                data => console.log('success'),
                error => console.log(error)
            )
    }
	}

  subir() {
    let parseString = require('xml2js').parseString;
    let xml;
    let a = parseString(this.xml, function (err, result) {
      xml = result;
    });
    console.log(xml)

    console.log(xml.ADOXML.MODELS[0].MODEL[0].INSTANCE)
    //this.database.changeCompleteTree(xml.ADOXML.MODELS[0].INSTANCE);
    //this.database.dataChange.next(xml.ADOXML.MODELS[0].INSTANCE);
    
    //this.database.changeCompleteTree(xml.ADOXML.MODELS[0].MODEL[0].INSTANCE)
    const data = this.database.buildFileTree(xml.ADOXML.MODELS[0].MODEL[0].INSTANCE, 0);

    // Notify the change.
    this.database.dataChange.next(data);
    /*
    this.database.dataChange.subscribe(data => {
      this.dataSource.data = xml.ADOXML.MODELS[0].INSTANCE;
    });
    
    //this.dataSource.data = xml.ADOXML.MODELS[0].INSTANCE;
    
    this.formulario = false;


  } */
}
