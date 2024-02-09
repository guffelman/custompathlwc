// customPathComponent.js
// Garrett Uffelman (garrett.uffelman@customtruck.com)
// Last Modified: 2024-01-05
// Desc: Updated the custom path component to include dependent picklist functionality. 
//       Cleaned up the code and added comments for clarity. 

import { LightningElement, api, wire, track } from "lwc";
// at some point, we need to look at uiRecordAPI as it is deprecated
import { getRecord, updateRecord } from "lightning/uiRecordApi";
import { getPicklistValues, getObjectInfo } from "lightning/uiObjectInfoApi";
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
  @api picklistDependencies;
  @api dependentStatus;
  @api dependentPicklistField;

  @track currentPath;
  @track selectedStep = "";
  @track allPaths = [];
  @track pathNotClickable = true;
  @track showDependentPicklist = false;


  selectedPathIndex = -1;
  dependentPicklistValues = [];
  dependentPicklistValue;

  // -----------------------------------------
  // Wire Methods
  // -----------------------------------------

  @wire(getObjectInfo, { objectApiName: "$objectApiName" })
  objectInfo({ error, data }) {
    if (data) {
      this.objectInformation = data;
    } else if (error) {
      console.error("Error fetching object info: ", error);
    }
  }

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

  @wire(getRecord, {
    recordId: "$recordId",
    fields: [vendorfield] // and any dependent fields

  })
  record;

  @wire(getRecord, {
    recordId: "$recordId",
    fields: "$dependentPicklistFieldName",
  }) 
  dependentPicklistValue;



  @wire(getPicklistValues, {
    recordTypeId: "$recordTypeId",
    fieldApiName: "$objectQualifiedPathFieldApiName",
  })
  fetchAllPaths({ error, data }) {
    if (data) {
      this.allPaths = this.parseAllPathsData(data);
    } else if (error) {
      console.error(
        "fail to obtain picklist values with fieldApiName = ",
        this.objectQualifiedPathFieldApiName,
        " on record-type-id = ",
        this.recordTypeId
      );
      console.error(error);
    }
  }

  @wire(getPicklistValues, {
    recordTypeId: "$recordTypeId",
    fieldApiName: "$dependentPicklistFieldName",
  })
  wiredPicklistValues({ error, data }) {
    if (data) {
      this.dependentPicklistValues = data.values.map((item) => ({
        label: item.label,
        value: item.value,
      }));
    } else if (error) {
      console.error("Error fetching picklist values", error);
    }
  }




  // -----------------------------------------
  // Connected Callback & Rendered Callback
  // -----------------------------------------

  connectedCallback() {
    if (this.picklistDependencies) {
      // if the picklistDependencies is defined and the picklistDependencyIndex is the same as the currentPathIndex, then hide the save button
      if (this.picklistDependencyIndex == this.currentPathIndex + 1) {
        // do nothing, the button will be hidden
      }
    }
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

  handlePathSelected(event) {
    this.selectedStep = event.target.value;
    this.selectedPathIndex = event.detail.index;
    const cpi = this.currentPathIndex;

    // Check if the selected status requires showing the dependent picklist
    if (this.shouldShowDependentPicklist()) {
      // Handle the logic to show the dependent picklist and hide the "Save" button
      this.displayDependentPicklist();
    } else {
      // Handle the logic to hide the dependent picklist and show the "Save" button
      this.hideDependentPicklist();
    }

    this.pathNotClickable =
      cpi == this.selectedPathIndex ||
      (this.allPaths[cpi].allowTo.length > 0 &&
        !this.allPaths[cpi].allowTo.includes(this.selectedPathIndex));
    if (this.hideButton) {
      this.toggleChangePathButton(this.pathNotClickable);
    }
  }

  async handleSavePath() {
    console.log("hi there, saving the path")
    try {
      console.log("inside the try block")
      const saveButton = this.template.querySelector("lightning-button");
      saveButton.disabled = true;
      saveButton.label = "Saving...";
      console.log("value of dependentPicklistValue: " + JSON.stringify(this.dependentPicklistValue.value))

      const fields = {};
      fields["Id"] = this.recordId;
      fields[this.picklistPathFieldApiName] =
        this.allPaths[this.selectedPathIndex].value;

      let shouldSaveRecord = true;

      // if the status requires a dependent picklist and the dependent picklist value is not set, then display the modal
      if (this.showDependentPicklist == true && !this.dependentPicklistValue.value) {
        console.log("value of dependentPicklistValue: " + this.dependentPicklistValue)
        let result = await this.displayDependentModal();
        if (result === "cancel") {
          saveButton.disabled = false;
          saveButton.label = this.buttonLabel;
          shouldSaveRecord = false;
        } else {
          fields[this.dependentPicklistField] = result;
        }
      }

      if (
        shouldSaveRecord &&
        this.objectApiName === "Case" &&
        this.allPaths[this.selectedPathIndex].value === "Closed" &&
        this.numVendors > 0
      ) {
        let result = await this.handleCasePaperworkComplete();
        if (result === "cancel") {
          saveButton.disabled = false;
          saveButton.label = this.buttonLabel;
          shouldSaveRecord = false;
        }
      }

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
          // if the path is the final path item, then fire the confetti
          if (this.selectedPathIndex === this.allPaths.length - 1) {
            this.basicCannon();
          }
          // if the object is case, then play the sound
          if (
            this.objectApiName === "Case" &&
            this.selectedPathIndex === this.allPaths.length - 1
          ) {
            const audio = new Audio(successmario);
            audio.play();
          }
        });
      }

      // Perform pre-save checks and additional logic here
    } catch (error) {
      console.log("Hit an error, just so you know.")
      console.error("error: " + error);
      // Handle errors appropriately
      this.handleError(error);
    }
  }

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
          reject("cancel");
        }
      });
    });
  }

  handleError(error) {
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
  }

  // -----------------------------------------
  // Dependent Picklist Methods
  // -----------------------------------------

  displayDependentModal() {
    return new Promise((resolve, reject) => {
      DependentStageModal.open({
        fieldName: this.dependentPicklistLabel,
        size: "large",
        fieldOptions: this.dependentPicklistValueSet,
        dependentField: this.dependentPicklistField,
        stage: this.dependentStatus,
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

  shouldShowDependentPicklist() {
    // Check if the selected status matches the dependent status
    const shouldShow = this.selectedStep === this.dependentStatus;
    return shouldShow;
  }

  displayDependentPicklist() {
    this.showDependentPicklist = true;
  }

  hideDependentPicklist() {
    this.showDependentPicklist = false;
  }

  // -----------------------------------------
  // Getters
  // -----------------------------------------

  get dependentPicklistValue() {
    // using uiRecordApi to get the value of the dependent picklist
    // return null;
    return this.dependentPicklistValue;
  }


  get dependentPicklistValueSet() {
    return this.dependentPicklistValues;
  }

  get dependentPicklistLabel() {
    return this.objectInformation.fields[this.dependentPicklistField].label;
  }

  get numVendors() {
    return this.record.data.fields.Number_of_unpaid_Vendors__c.value;
  }

  get dependentPicklistFieldName() {
    return this.objectApiName + "." + this.dependentPicklistField;
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

  get objectQualifiedPathFieldApiNames() {
    return [this.objectQualifiedPathFieldApiName];
  }

  // -----------------------------------------
  // Helper Methods
  // -----------------------------------------
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
