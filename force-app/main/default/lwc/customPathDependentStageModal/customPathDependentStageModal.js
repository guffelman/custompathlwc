// customPathDependentStageModal.js
// Garrett Uffelman (garrett.uffelman@customtruck.com)
// Last Modified: 2024-05-04
// Change History:
// 2024-05-04: Added functionality for dependentTextField. Cleaned up cancel code. 
// Desc: Custom modal for dependent stage picklist. Required for customPathComponent to work properly. 

import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class DependentStageModal extends LightningModal {
    @api fieldName;
    @api fieldOptions;
    @api selectedValue;
    @api stage;
    @api dependentField;
    @api dependentTextField;
    @api dependentTextFieldType;
    @api dependentTextFieldValue;
    @api dependentTextFieldRequired;
    @api dependentTextFieldLabel;

    error;



    handleSave(){
        this.error = undefined;
        if (this.selectedValue != undefined) {
            if (this.dependentTextFieldRequired && this.dependentTextFieldValue == undefined) {
                this.error = 'Please enter a value for ' + this.dependentTextField;
                return;
            } else {
                this.close(this.result);
            }
        } else {
            this.error = 'Please select a value for ' + this.fieldName;
        }
    }


    handleCancel() {
        this.close();

    }

    handleFieldChange(event) {
        this.selectedValue = event.target.value;
    }

    handleDependentTextFieldChange(event) {
        this.dependentTextFieldValue = event.target.value;
    }


    // if the user presses escape, close the modal
    handleKeydown(event) {
        if (event.key === 'Escape') {
            this.close();
        }
        if (event.key === 'Enter') {
            this.handleSave();

        }
    }


    // getter to determine if we have a dependent text fiel
    get hasDependentTextField() {
        // return true if we have a dependentTextField
        return this.dependentTextField !== undefined;
    }

    get dependentTextFieldClass() {
        switch (this.dependentTextFieldType) {
            case 'smallText':
                return 'slds-input';
            case 'longText':
                return 'slds-input-long';
            default:
                return 'slds-input';
        }
    }

    get isDependentTextFieldTextArea() {
        switch (this.dependentTextFieldType) {
            case 'smallText':
                return false;
            case 'longText':
                return true;
            default:
                return false;
        }
    }

    get dependentPicklistLabel() {
        return this.dependentPicklistLabel;
    }

    get result() {
        return {
            selectedValue: this.selectedValue,
            dependentTextFieldValue: this.dependentTextFieldValue
        };
    }


    
}