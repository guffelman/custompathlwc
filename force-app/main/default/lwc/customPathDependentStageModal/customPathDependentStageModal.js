// customPathDependentStageModal.js
// Garrett Uffelman (garrett.uffelman@customtruck.com)
// Last Modified: 2024-01-05
// Desc: Custom modal for dependent stage picklist. Required for customPathComponent to work properly. 

import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class DependentStageModal extends LightningModal {
    @api fieldName;
    @api fieldOptions;
    @api selectedValue;
    @api stage;
    @api dependentField;

    handleOkay() {
        // consider dispatching a custom event here instead of just the mutated this.selectedValue
        this.close(this.selectedValue);
    }

    handleCancel() {
        this.close('cancel');

    }

    handleFieldChange(event) {
        this.selectedValue = event.target.value;
    }

    // if the user clicks outside the modal, close it
    handleOutsideClick() {
        this.close('cancel');
    }

    // if the user presses escape, close the modal
    handleKeydown(event) {
        if (event.key === 'Escape') {
            this.close('cancel');
        }
    }

    // if the user presses enter, close the modal
    handleEnter(event) {
        if (event.key === 'Enter') {
            this.close(this.selectedValue);
        }
    }

    // handle Outside Click, Escape, and Enter.. also handle X button click

    connectedCallback() {
        // listen for the events that close the modal
        // document.addEventListener('click', this.handleOutsideClick.bind(this));
    }


    
}