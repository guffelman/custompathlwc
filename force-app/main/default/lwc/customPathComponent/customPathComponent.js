import { LightningElement, api, wire, track } from "lwc";
// at some point, we need to look at uiRecordAPI as it is deprecated
import { getRecord, updateRecord } from "lightning/uiRecordApi";
import { getPicklistValues } from "lightning/uiObjectInfoApi";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import vendorfield from "@salesforce/schema/Case.Number_of_unpaid_Vendors__c";

import { loadScript } from "lightning/platformResourceLoader";
import CONFETTI from "@salesforce/resourceUrl/confetti";
import successmario from "@salesforce/resourceUrl/successmario";

export default class CustomPath extends LightningElement {
  @api objectApiName;
  @api recordId;
  @api recordTypeId; // master record type   012000000000000AAA
  @api record;

  @api picklistPathFieldApiName; // must be a picklist field and case-sensitive here
  @api hideButton; // whether to hide the button or just to disable the button

  @api pathChangeButtonLabel;

  @api navigationRule;
  //   @api numVendors;

  @track currentPath;
  @track selectedStep = "";
  @track allPaths = [];

  @track pathNotClickable = true;

  selectedPathIndex = -1;

  @wire(getRecord, {
    recordId: "$recordId",
    fields: "$objectQualifiedPathFieldApiName",
  })
  fetchCurrentPath({ error, data }) {
    if (data) {
      this.currentPath = data.fields[this.picklistPathFieldApiName].value;
    } else if (error) {
      console.log("fail to obtain current path with Id = ", this.recordId);
      console.log(error);
    }
  }

  @wire(getPicklistValues, {
    recordTypeId: "$recordTypeId",
    fieldApiName: "$objectQualifiedPathFieldApiName",
  })
  fetchAllPaths({ error, data }) {
    if (data) {
      this.allPaths = this.parseAllPathsData(data);
      console.log("g>>>>>> " + this.allPaths);
    } else if (error) {
      console.log(
        "fail to obtain picklist values with fieldApiName = ",
        this.objectQualifiedPathFieldApiName,
        " on record-type-id = ",
        this.recordTypeId
      );
      console.log(error);
    }
  }

  @wire(getRecord, {
    recordId: "$recordId",
    fields: [vendorfield],
  })
  record;

  get numVendors() {
    console.log(
      "g debug>>>>>>> " +
        this.record.data.fields.Number_of_unpaid_Vendors__c.value
    ); // Add this line to debug
    return this.record.data.fields.Number_of_unpaid_Vendors__c.value;
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

  renderedCallback() {
    if (this.hideButton) {
      this.toggleChangePathButton(this.pathNotClickable);
    }
  }

  handlePathSelected(event) {
    this.selectedStep = event.target.value;
    this.selectedPathIndex = event.detail.index;
    const cpi = this.currentPathIndex;
    this.pathNotClickable =
      cpi == this.selectedPathIndex ||
      (this.allPaths[cpi].allowTo.length > 0 &&
        !this.allPaths[cpi].allowTo.includes(this.selectedPathIndex));
    if (this.hideButton) {
      this.toggleChangePathButton(this.pathNotClickable);
    }
  }

  toggleChangePathButton(toHide) {
    this.template.querySelector("lightning-button").style = toHide
      ? "display: none"
      : "display: block";
  }

  handleSavePath() {
    // make the button label 'Saving...' and disable it
    this.template.querySelector("lightning-button").disabled = true;
    this.template.querySelector("lightning-button").label = "Saving...";

    const fields = {};
    fields["Id"] = this.recordId;
    fields[this.picklistPathFieldApiName] =
      this.allPaths[this.selectedPathIndex].value;

    if (
      this.objectApiName === "Case" &&
      this.allPaths[this.selectedPathIndex].value === "Closed" &&
      this.numVendors > 0
    ) {
      this.handleCasePaperworkComplete();
    } else {
      updateRecord({ fields })
        .then(() => {
          console.log("Update successful. Now processing success block...");

          // Additional logging to identify where the process might be getting stuck
          console.log("Step 1");
          this.pathNotClickable = true;
          console.log("Step 2");
          if (this.hideButton) {
            console.log("Step 3");
            this.toggleChangePathButton(this.pathNotClickable);
          }
          console.log("Step 4");
          this.template.querySelector("lightning-button").disabled = false;
          console.log("Step 5");
          this.template.querySelector("lightning-button").label =
            this.buttonLabel;
          console.log("Step 6");

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
          if (this.objectApiName === "Case" && this.selectedPathIndex === this.allPaths.length - 1) {
            const audio = new Audio(
              successmario
            );
            audio.play();
          }
          console.log("Success block processed successfully.");
        })
        .catch((error) => {
          this.handleError(error);
        });
    }
  }

  async handleCasePaperworkComplete() {
    const result = await LightningConfirm.open({
      message:
        "This case has " +
        this.numVendors +
        " unpaid vendors. Are you sure you want to close this case?",
      variant: "default", // headerless
      label: "Close Case",
    });

    //result is true if OK was clicked
    if (result) {
      //do something
      this.handleCaseProceed();

      // since we showed the modal, we want to do extra stuff here.
    } else {
      // close the modal
      this.template.querySelector("lightning-button").disabled = false;
      this.template.querySelector("lightning-button").label = this.buttonLabel;
    }
  }

  handleCaseProceed() {
    // make the button label 'Saving...' and disable it
    this.template.querySelector("lightning-button").disabled = true;
    this.template.querySelector("lightning-button").label = "Saving...";
    const fields = {};
    fields["Id"] = this.recordId;
    fields[this.picklistPathFieldApiName] =
      this.allPaths[this.selectedPathIndex].value;
    fields["Override_Vendor_Payment__c"] = true;
    updateRecord({ fields })
      .then(() => {
        this.pathNotClickable = true;
        if (this.hideButton) {
          this.toggleChangePathButton(this.pathNotClickable);
        }
        this.template.querySelector("lightning-button").disabled = false;
        this.template.querySelector("lightning-button").label =
          this.buttonLabel;

        this.dispatchEvent(
          new ShowToastEvent({
            title: "Success",
            message: this.allPaths[this.selectedPathIndex].label,
            variant: "success",
          })
        );
        this.basicCannon();
        if (this.objectApiName === "Case") {
          const audio = new Audio(
            successmario);
          console.log("audio volume: " + audio.volume);
          audio.play();

        }
      })
      .catch((error) => {
        this.handleError(error);
      });
  }

  handleError(error) {
    console.log("Error: " + JSON.stringify(error));
    this.template.querySelector("lightning-button").disabled = false;
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

    // Log the error for further analysis
    console.error("Handled error:", JSON.stringify(error));

    // Now you can use the errorMessage as needed in your component
    console.error(errorMessage);

    this.dispatchEvent(
      new ShowToastEvent({
        title: "Action not saved!",
        message: errorMessage,
        variant: "error",
      })
    );
  }

  get objectQualifiedPathFieldApiName() {
    return this.objectApiName + "." + this.picklistPathFieldApiName;
  }

  get objectQualifiedPathFieldApiNames() {
    return [this.objectQualifiedPathFieldApiName];
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
      //	console.log('\tfrom = ', from, '\t\ttoList = ', toList);
      ret.push(from, toList);
    }
    // console.log( ret );
    return ret;
  }

  /*
    parseNaviRule( 'a={b, c}, b=!{a, d}, c={d}' );

    from =  [ 'a' ] 		toList =  [ 'b', 'c' ]
    from =  [ 'b', '!' ] 	toList =  [ 'a', 'd' ]
    from =  [ 'c' ] 		toList =  [ 'd' ]
    [ [ 'a' ], [ 'b', 'c' ], [ 'b', '!' ], [ 'a', 'd' ], [ 'c' ], [ 'd' ] ]
     */

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
