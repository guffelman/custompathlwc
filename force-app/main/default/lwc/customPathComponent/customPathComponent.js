// customPathComponent.js
// Garrett Uffelman (garrett.uffelman@customtruck.com)
// Last Modified: 2024-06-27
// Desc: Modified the path component to be able to accept multiple dependent picklist fields and text fields. New dependentFormula created.
//

import { LightningElement, api, wire, track } from "lwc";
import { getRecord, updateRecord, getFieldValue } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType,
} from "lightning/uiObjectInfoApi";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import vendorfield from "@salesforce/schema/Case.Number_of_unpaid_Vendors__c";

import DependentStageModal from "c/customPathDependentStageModal";
import { loadScript } from "lightning/platformResourceLoader";
import CONFETTI from "@salesforce/resourceUrl/confetti";
import successmario from "@salesforce/resourceUrl/successmario";

export default class CustomPath extends LightningElement {
  @api objectApiName;
  @api recordId;
  @api recordTypeId; // master record type   012000000000000AAA
  @api record;
  @api objectInformation;
  @api picklistPathFieldApiName; // must be a picklist field and case-sensitive here
  @api hideButton; // whether to hide the button or just to disable the button
  @api pathChangeButtonLabel;
  @api navigationRule;
  @api dependentFormula; // formula of dependent statuses, and dependent picklist fields, and dependent text fields.
  @api dependentTextFieldType;
  @api dependentTextFieldRequired;
  @api celebrationAnimation;
  @api picklists;

  @track currentPath;
  @track selectedStep = "";
  @track allPaths = [];
  @track pathNotClickable = true;
  @track showDependentPicklist = false;

  selectedPathIndex = -1;
  dependentPicklistValues = [];
  dependentPicklistValueSet = [];


  // -----------------------------------------
  // Wire Methods
  // -----------------------------------------

  // Gets general info about the object. Used to get the labels of fields.
  @wire(getObjectInfo, { objectApiName: "$objectApiName" })
  objectInfo({ error, data }) {
    if (data) {
      this.objectInformation = data;
    } else if (error) {
      console.error("Error fetching object info: ", error);
    }
  }

  // Used to get the current value of the (status) picklist field. Used to determine the current path status. (IE: On Hold, Active, etc...)
  @wire(getRecord, {
    recordId: "$recordId",
    fields: "$objectQualifiedPathFieldApiName",
  })
  fetchCurrentPath({ error, data }) {
    if (data) {
      this.currentPath = data.fields[this.picklistPathFieldApiName].value;
    } else if (error) {
      console.error("Error fetching current path:", error);
    }
  }

  // For Case records, get the number of unpaid vendors. CTOS Specific.
  @wire(getRecord, {
    recordId: "$recordId",
    optionalFields: [vendorfield],
  })
  obtainedRecord({ error, data }) {
   // if the data is not there, then fail silently
    if (data) {
      this.record = data;
      console.log(data);
      } else if (error) {
      console.error("Error fetching record:", error);
    }
  }

  // Used to get the values of all dependent picklists, that way we don't display the modal if the value is already set.
  @wire(getRecord, {
    recordId: "$recordId",
    fields: "$dependentPicklistFieldName",
  })
  gotValue({ error, data }) {
    if (data) {
      this.dependentPicklistValues = data.fields;
    } else if (error) {
      console.error("Error fetching picklist values:", error);
    }
  }

  // Used to get picklist options for the dependent picklists. Gets all picklist options for the object & record type, as I struggled to do more than one with the other method.
  @wire(getPicklistValuesByRecordType, {
    objectApiName: "$objectApiName",
    recordTypeId: "$recordTypeId",
  })
  wiredPicklistValuesByRecordType({ error, data }) {
    if (data) {
      this.picklists = data.picklistFieldValues;

      if (this.dependentFormula) {
        const parsedFormula = this.parsedependentFormula();
        let dependentFields = Object.keys(parsedFormula).map((item) => {
          return parsedFormula[item].dependentPicklist;
        });

        this.dependentPicklistValueSet = dependentFields.reduce((acc, item) => {
          acc[item] = {
            values: this.picklists[item] ? this.picklists[item].values : {},
          };
          return acc;
        }, {});
      }

      this.allPaths = this.parseAllPathsData(
        this.picklists[this.picklistPathFieldApiName]
      );
    } else if (error) {
      console.error("Error fetching picklist values", error);
    }
  }

  // -----------------------------------------
  // Connected Callback & Rendered Callback
  // -----------------------------------------

  connectedCallback() {
    Promise.all([loadScript(this, CONFETTI)])
      .then(() => {
        this.setUpCanvas();
      })
      .catch((error) => {
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Error",
            message: error.message,
            variant: error,
          })
        );
      });
  }

  renderedCallback() {
    if (this.hideButton) {
      this.toggleChangePathButton(this.pathNotClickable);
    }
  }

  // -----------------------------------------
  // Event Handlers
  // -----------------------------------------

  // Executed whenever the user clicks on a path item. This will update the selectedStep and selectedPathIndex.
  handlePathSelected(event) {
    this.selectedStep = event.target.value;
    this.selectedPathIndex = event.detail.index;
    const cpi = this.currentPathIndex;

    // Check if the selected status requires showing the dependent picklist
    if (this.shouldShowDependentPicklist()) {
      // Handle the logic to show the dependent picklist and hide the "Save" button
      this.showDependentPicklist = true;
    } else {
      // Handle the logic to hide the dependent picklist and show the "Save" button
      this.showDependentPicklist = false;
    }

    this.pathNotClickable =
      cpi == this.selectedPathIndex ||
      (this.allPaths[cpi].allowTo.length > 0 &&
        !this.allPaths[cpi].allowTo.includes(this.selectedPathIndex));
    if (this.hideButton) {
      this.toggleChangePathButton(this.pathNotClickable);
    }
  }

  // Executed whenever the user hits 'Save'. This will update the record with the new path status, and trigger the modal if necessary.
  async handleSavePath() {
    try {
      const saveButton = this.template.querySelector("lightning-button");
      saveButton.disabled = true;
      saveButton.label = "Saving...";
  
      const fields = {};
      fields["Id"] = this.recordId;
      fields[this.picklistPathFieldApiName] =
        this.allPaths[this.selectedPathIndex].value;
  
      let shouldSaveRecord = true;
  
// Check if the status requires a dependent picklist and if it's not set, display modal
if (this.showDependentPicklist) {
  let result = await this.displayDependentModal({
    fieldname: this.getFieldLabel(
      this.parsedependentFormula()[this.selectedStep].dependentPicklist
    ),
    size: "large",
    dependentPicklistValueSet:
      this.dependentPicklistValueSet[
        this.parsedependentFormula()[this.selectedStep].dependentPicklist
      ].values,
    dependentPicklistField:
      this.parsedependentFormula()[this.selectedStep].dependentPicklist,
    dependentTextField:
      this.parsedependentFormula()[this.selectedStep].dependentTextField,
    dependentTextFieldLabel:
      this.parsedependentFormula()[this.selectedStep].dependentTextField
        ? this.getFieldLabel(this.parsedependentFormula()[this.selectedStep].dependentTextField)
        : null,
    dependentTextFieldType: this.dependentTextFieldType,
    dependentTextFieldRequired: this.dependentTextFieldRequired,
    dependentStatus: this.selectedStep,
  });

  
        if (!result) {
          // Modal was canceled or closed
          saveButton.disabled = false;
          saveButton.label = this.buttonLabel;
          shouldSaveRecord = false;
        } else {
          // Update fields with dependent picklist and text field values
          fields[this.parsedependentFormula()[this.selectedStep].dependentPicklist] = result.selectedValue;
          fields[this.parsedependentFormula()[this.selectedStep].dependentTextField] = result.dependentTextFieldValue;
        }
      }
  
      // Additional checks specific to Case object
      if (shouldSaveRecord && this.objectApiName === "Case" && this.allPaths[this.selectedPathIndex].value === "Closed" && this.numVendors > 0) {
        let result = await this.handleCasePaperworkComplete();
        if (result === "cancel") {
          saveButton.disabled = false;
          saveButton.label = this.buttonLabel;
          shouldSaveRecord = false;
        }
      }
  
      // Proceed with saving the record
      if (shouldSaveRecord) {
        await updateRecord({ fields }).then(() => {
          this.pathNotClickable = true;
          if (this.hideButton) {
            this.toggleChangePathButton(this.pathNotClickable);
          }
          saveButton.disabled = false;
          saveButton.label = this.buttonLabel;
  
          this.dispatchEvent(
            new ShowToastEvent({
              title: "Success",
              message: this.allPaths[this.selectedPathIndex].label,
              variant: "success",
            })
          );
  
          // Perform additional actions upon successful save if needed
          if (this.selectedPathIndex === this.allPaths.length - 1) {
            if (this.celebrationAnimation) {
              this.basicCannon();
            }
          }
          if (this.objectApiName === "Case" && this.selectedPathIndex === this.allPaths.length - 1) {
            const audio = new Audio(successmario);
            audio.play();
          }
        });
      }
  
    } catch (error) {
      console.error("Error: ", error);
      this.handleError(error); // Call your error handling method
    }
  }
  

  // For CTOS cases, when we attempt to close a case with unpaid vendors, we need to display a modal to confirm the action.
  handleCasePaperworkComplete() {
    return new Promise((resolve, reject) => {
      const modal = LightningConfirm.open({
        message:
          "This case has " +
          this.numVendors +
          " unpaid vendors. Are you sure you want to close this case?",
        variant: "default", // default|warning|destructive
        label: "Close Case",
      });
      modal.then((result) => {
        if (result) {
          resolve("OK");
        } else {
          resolve("cancel");
        }
      });
    });
  }

  handleError(error) {
    try {
      console.error("Error: " + JSON.stringify(error));
      this.template.querySelector("lightning-button").disabled = false;
      this.template.querySelector("lightning-button").label = this.buttonLabel;
      let errorMessage = "Action not saved!";
  
      if (error) {
        if (Array.isArray(error.body.output?.errors)) {
          // If there are specific validation errors, use the first one as the error message
          const firstError = error.body.output.errors[0];
          if (firstError) {
            errorMessage = firstError.message;
          }
        } else if (error.body.message) {
          // If no specific validation errors, use the general error message
          errorMessage = error.body.message;
        }
      }
      console.error("Handled error:", JSON.stringify(error));
      console.error(errorMessage);
  
      this.dispatchEvent(
        new ShowToastEvent({
          title: "Action not saved!",
          message: errorMessage,
          variant: "error",
        })
      );
    } catch (e) {
      console.error("Unexpected error:", e);
      this.dispatchEvent(
        new ShowToastEvent({
          title: "Action not saved!",
          message: "An unexpected error occurred.",
          variant: "error",
        })
      );
    }
  }

  // -----------------------------------------
  // Dependent Picklist Methods
  // -----------------------------------------

  // Displays the dependent modal for the field specified in the options. Returns a promise that resolves with the selected value.
  displayDependentModal(options) {
    const {
      fieldname,
      size,
      dependentPicklistValueSet,
      dependentPicklistField,
      dependentTextField,
      dependentTextFieldLabel,
      dependentTextFieldType,
      dependentTextFieldRequired,
      dependentStatus,
    } = options;
    return new Promise((resolve, reject) => {
      DependentStageModal.open({
        fieldName: fieldname,
        size: size || "large",
        fieldOptions: dependentPicklistValueSet,
        dependentField: dependentPicklistField,
        dependentTextField: dependentTextField,
        dependentTextFieldLabel: dependentTextFieldLabel,
        dependentTextFieldType: dependentTextFieldType,
        dependentTextFieldRequired: dependentTextFieldRequired,
        stage: dependentStatus,
      })
        .then((result) => {
          resolve(result);
        })
        .catch((error) => {
          console.error("error popping modal: " + error);
          reject(error);
        });
    });
  }

  // Determines whether we should show the dependent picklist based on the selected step.
  shouldShowDependentPicklist() {
    let objectinfo = this.parsedependentFormula();
    let dependentStatuses = Object.keys(objectinfo);
    return dependentStatuses.includes(this.selectedStep);
  }

  // -----------------------------------------
  // Getters
  // -----------------------------------------


  get saveButtonLabel(){
    // return Mark Status as {this.currentPath} the first time... then afterwards use {this.selectedStep}.. otherwise if pathChangeButtonLabel has a value use that
    // return this.selectedStep === "" ? `Mark Status as ${this.currentPath}` : `Mark Status as ${this.selectedStep}`;
    return this.pathChangeButtonLabel ? this.pathChangeButtonLabel : this.selectedStep === "" ? `Mark Status as ${this.currentPath}` : `Mark Status as ${this.selectedStep}`;
  }


  get numVendors() {
    if (this.objectApiName === "Case") {
      // console.log(getFieldValue(this.record.data, vendorfield));
      // return getFieldValue(this.record.data, vendorfield);

      console.log(this.record.fields.Number_of_unpaid_Vendors__c.value)
      return this.record.fields.Number_of_unpaid_Vendors__c.value
    } else {
      return 0;
    }
  }

  get dependentPicklistFieldName() {
    let objectinfo = this.parsedependentFormula();
    objectinfo = Object.keys(objectinfo).map((item) => {
      return this.objectApiName + "." + objectinfo[item].dependentPicklist;
    });
    let dependentPicklistFields = [...new Set(objectinfo)];
    return dependentPicklistFields;
  }

  get currentPathIndex() {
    let idx = 0;
    if (this.allPaths && this.currentPath) {
      for (let i = 0; i < this.allPaths.length; i++) {
        if (this.allPaths[i].value === this.currentPath) {
          idx = i;
          break;
        }
      }
    }
    return idx;
  }

  get buttonLabel() {
    if (this.selectedStep === "") {
      return "Select a Step";
    }
    return `Mark Status as ${this.selectedStep}`;
  }

  get objectQualifiedPathFieldApiName() {
    return this.objectApiName + "." + this.picklistPathFieldApiName;
  }

  // -----------------------------------------
  // Helper Methods
  // -----------------------------------------

  // Gets all of the dependent picklist fields, dependent text fields, and the statuses that accompany them. Parses the formula.
  parsedependentFormula() {
    let input = this.dependentFormula;
    let sets = input.split(",");

    let output = {};

    sets.forEach((set) => {
      set = set.trim();
      // This regex handles the case where the text field might be missing
      let match = set.match(/^(.*?)\[(.*?)\](?:\[(.*?)\])?$/);

      if (match) {
        let dependentStatus = match[1].trim();
        let dependentPicklist = match[2] ? match[2].trim() : null;
        let dependentTextField = match[3] ? match[3].trim() : null;

        // Create an object for the dependentStatus if it doesn't exist
        if (!output[dependentStatus]) {
          output[dependentStatus] = {};
        }

        // Update the values for the dependentStatus
        if (dependentPicklist) {
          output[dependentStatus].dependentPicklist = dependentPicklist;
        }
        if (dependentTextField) {
          output[dependentStatus].dependentTextField = dependentTextField;
        }
      } else {
        console.warn(`Input '${set}' does not match expected format.`);
      }
    });

    return output;
  }

  getFieldLabel(field) {
    return this.objectInformation.fields[field].label;
  }

  addObjectName(field) {
    return this.objectApiName + "." + field;
  }

  toggleChangePathButton(toHide) {
    this.template.querySelector("lightning-button").style = toHide
      ? "display: none"
      : "display: block";
  }

  parseAllPathsData(data) {
    const ret = [];
    const controlToMeMap = [];
    const val2idx = {};
    for (let myIdx = 0; myIdx < data.values.length; myIdx++) {
      const item = data.values[myIdx];
      if (item.validFor) {
        for (const ctrIdx of item.validFor) {
          controlToMeMap[ctrIdx] = controlToMeMap[ctrIdx] || [];
          controlToMeMap[ctrIdx].push(myIdx);
        }
      }
      ret.push({
        label: item.label,
        value: item.value,
        allowTo: [],
      });
      val2idx[item.value] = ret.length - 1;
    }
    for (let ctrIdx = 0; ctrIdx < controlToMeMap.length; ctrIdx++) {
      // control field and me have the same indexes, labels and values
      const allowedPathIndex = controlToMeMap[ctrIdx];
      if (allowedPathIndex && allowedPathIndex.length > 0) {
        ret[ctrIdx].allowTo = allowedPathIndex;
      }
    }
    this.mergeWithNavigationRule(val2idx, ret);
    return ret;
  }

  resolvePicklistIndexFromValue(value2Index, value) {
    const ret = value2Index[value];
    if (ret === undefined) {
      throw new Error(
        "'" + value + "' is not in {" + Object.keys(value2Index) + "}"
      );
    }
    return ret;
  }

  mergeWithNavigationRule(value2Index, paths) {
    if (this.navigationRule && this.navigationRule.length > 0) {
      // a={b, c}, b=!{a, d} where a, b are the values of picklist.
      // This rule says: a can go to b or c; b cannot go to a and d, the rest can go anywhere
      const fromToList = this.parseNaviRule(this.navigationRule);
      for (let i = 0; i < fromToList.length; i += 2) {
        const from = fromToList[i];
        const toList = fromToList[i + 1];
        const fromIdx = this.resolvePicklistIndexFromValue(
          value2Index,
          from[0]
        ); // either 1 or 2 elements, if 2 means !=negative
        const toListIdx = toList.map((v) =>
          this.resolvePicklistIndexFromValue(value2Index, v)
        );
        let toAddList = [];
        let toRemoveList = [];
        if (from.length == 2 && from[1] === "!") {
          // negative
          for (let j = 0; j < paths.length; j++) {
            if (!toListIdx.includes(j)) {
              toAddList.push(j);
            }
          }
          toAddList.push(fromIdx);
          toRemoveList = toListIdx;
        } else {
          // positive
          toAddList = [...toListIdx, fromIdx];
        }
        const myPath = paths[fromIdx];
        myPath.allowTo = myPath.allowTo || [];
        if (myPath.allowTo.length == 0) {
          // Otherwise, no point to add because field dependencies will give error at saving time
          for (const idx of toAddList) {
            if (!myPath.allowTo.includes(idx)) {
              myPath.allowTo.push(idx);
            }
          }
        } else {
          for (const idx of toRemoveList) {
            const pos = myPath.allowTo.indexOf(idx);
            if (pos !== -1) {
              myPath.allowTo.splice(pos, 1);
            }
          }
        }
      }
    }
  }

  parseNaviRule(ruleStr) {
    const ret = [];
    const rules = ruleStr
      .split("}")
      .filter((s) => s.length > 0)
      .map((s) => s.trim());
    for (const r of rules) {
      let [from, toList] = r
        .split("{")
        .filter((s) => s.length > 0)
        .map((s) => s.trim());
      from = from
        .split(",")
        .filter((s) => s.length > 0)
        .map((s) => s.trim())[0];
      from = from
        .split(";")
        .filter((s) => s.length > 0)
        .map((s) => s.trim())[0];
      from = from
        .split("=")
        .filter((s) => s.length > 0)
        .map((s) => s.trim());
      toList = toList
        .split(",")
        .filter((s) => s.length > 0)
        .map((s) => s.trim());
      ret.push(from, toList);
    }
    return ret;
  }

  /*
    parseNaviRule( 'a={b, c}, b=!{a, d}, c={d}' );

    from =  [ 'a' ] 		toList =  [ 'b', 'c' ]
    from =  [ 'b', '!' ] 	toList =  [ 'a', 'd' ]
    from =  [ 'c' ] 		toList =  [ 'd' ]
    [ [ 'a' ], [ 'b', 'c' ], [ 'b', '!' ], [ 'a', 'd' ], [ 'c' ], [ 'd' ] ]
     */

  // -----------------------------------------
  // Confetti & Sound
  // -----------------------------------------

  setUpCanvas() {
    var confettiCanvas = this.template.querySelector("canvas.confettiCanvas");
    this.myconfetti = confetti.create(confettiCanvas, { resize: true });
    // this.myconfetti({
    //   zIndex: 10000
    // });
  }

  basicCannon() {
    var end = Date.now() + 15 * 100;
    (function frame() {
      confetti({
        particleCount: 10,
        angle: 60,
        spread: 25,
        origin: {
          x: 0,
          y: 0.65,
        },
      });
      confetti({
        particleCount: 10,
        angle: 120,
        spread: 25,
        origin: {
          x: 1,
          y: 0.65,
        },
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }
}