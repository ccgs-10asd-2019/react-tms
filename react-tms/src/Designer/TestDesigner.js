import React from 'react';

import TextareaAutosize from 'react-autosize-textarea';

import {withAuthorization} from '../Session';

import '../w3.css';
import './TestDesigner.css';
import './QuestionDesigner.css';
const METADATA_TXT = {
  contentType: 'text/plain',
};

// Converts a given string to an array of Uint8 objects.
//
// This function enables us to write to the Cloud Firestore.
//
// Args:
//   s: The string which we convert to the bytearray.
//
function stringToUint8Array(s) {
  return new TextEncoder().encode(s);
}

// CSS Overrides pertinent to question styles.
//
const ADD_QUESTION_STYLES_OVERRIDE = {
  'fontSize': '17px',
  'textAlign': 'center',
};

// CSS Overrides pertinent to the sidebar.
//
const SIDEBAR_STYLES_OVERRIDE = {
  'backgroundColor': '#ebf2ff',
  'height': 'calc(100vh - 70px)',
  'width': '15em',
};

const UNSAVED_EDITOR_MESSAGE = 'You have unsaved changes. Are you sure you wish to proceed?';

// Returns the number of a test case input/output file.
// Note that this number will be 0-indexed.
//
function getNumFromFname(fname) {
  const secondHalf = fname.split('_')[1];
  const numberAsStr = secondHalf.split('.')[0];
  return parseInt(numberAsStr);
}

class TestDesigner extends React.Component {
  constructor(props) {
    super(props);

    const {testName} = this.props.match.params;
    this.testName = testName;
    if (this.testName === undefined) {
      console.error('testName is undefined.');
    }

    this.questionStatementRef = React.createRef();

    this.attemptedSelect = undefined;

    this.handleAddQuestion = this.handleAddQuestion.bind(this);
    this.handleSelectNewQuestion = this.handleSelectNewQuestion.bind(this);
    this.handleLoadNewQuestion = this.handleLoadNewQuestion.bind(this);

    this.handleStatementChange = this.handleStatementChange.bind(this);
    this.handleGetTextFromFile = this.handleGetTextFromFile.bind(this);
    this.loadQuestionStatementText = this.loadQuestionStatementText.bind(this);

    this.handleAddTestCase = this.handleAddTestCase.bind(this);
    this.handleRemoveTestCase = this.handleRemoveTestCase.bind(this);
    this.handleTestCaseInputChange = this.handleTestCaseInputChange.bind(this);
    this.handleTestCaseOutputChange = this.handleTestCaseOutputChange
      .bind(this);
    this.handleSaveToCloudFirestore = this.handleSaveToCloudFirestore
      .bind(this);

    this.renderQuestionView = this.renderQuestionView.bind(this);
    this.handleGetTextFromFile = this.handleGetTextFromFile.bind(this);

    this.newQuestions = new Set();

    this.state = {
      loadingQuestionNames: false,
      questionStatement: 'loading...',
      testCases: [],
      unsaved: false,
      questions: [],
      selectedIndex: 'loading...',
    };
  }

  componentDidMount() {
    const testRef = this.props.firebase.getStorageRef(`tests/${this.testName}`);
    const T = this;
    testRef.listAll().then(res => {
      res.prefixes.forEach(folderRef => {
        T.state.questions.push(folderRef.name);
      });
      T.state.questions.sort();
      T.setState({
        loadingQuestionNames: false,
      });
      T.handleSelectNewQuestion(0);
    });
  }

  ///////////////////////////////
  //                           //
  //    Test Designer utils    //
  //                           //
  ///////////////////////////////

  // Adds another question to the sidebar.
  handleAddQuestion() {
    this.state.questions.push(`Question ${this.state.questions.length}`);
    this.newQuestions.add(this.state.questions.length - 1);
    this.forceUpdate();
  }

  // Handles the selection of another question within the rendered list on the
  // sidebar.
  handleSelectNewQuestion(attemptedSelect) {
    if (attemptedSelect !== this.state.selectedIndex) {
      // The user has selected a question other than the one they are currently
      // viewing.
      if (this.state.unsaved) {
        if (window.confirm(UNSAVED_EDITOR_MESSAGE)) {
          this.handleLoadNewQuestion(attemptedSelect);
        } else {
          return;
        }
      } else {
        this.handleLoadNewQuestion(attemptedSelect);
      }
    }
  }

  // Handles the required loading of another question from the cloud firestore,
  // or alternatively the creation of a new question.
  handleLoadNewQuestion(newIdx) {
    if (this.newQuestions.has(newIdx)) {
      this.setState({
        testCases: [],
        unsaved: false,
        selectedIndex: newIdx,
      });
      this.loadQuestionStatementText('');
    } else {
      // Load the question from the cloud storage.
      const questionTitle = `Question ${newIdx}`;
      const testRef = this.props.firebase.getStorageRef(`tests/${this.testName}/${questionTitle}`);
      this.handleGetTextFromFile(testRef);
      this.setState({
        selectedIndex: newIdx,
      });
    }
  }

  handleGetTextFromFile(ref) {
    const T = this;
    ref.child('statement.txt').getDownloadURL().then(url => {
      fetch(url).then(response => {
        response.text().then(text => {
          T.loadQuestionStatementText(text);
        });
      });
    });

    this.setState({testCases: []});
    ref.child('inputs/').listAll().then(res => {
      res.items.forEach(itemRef => {
        const idx = getNumFromFname(itemRef.name);
        itemRef.getDownloadURL().then(url => {
          fetch(url).then(response => {
            response.text().then(text => {
              T.state.testCases[idx] = {...T.state.testCases[idx], input: text};
              this.forceUpdate();
            });
          });
        });
      });
    });

    setTimeout(()=>{}, 1);

    ref.child('outputs/').listAll().then(res => {
      res.items.forEach(itemRef => {
        itemRef.getDownloadURL().then(url => {
          fetch(url).then(response => {
            const idx = getNumFromFname(itemRef.name);
            response.text().then(text => {
              T.state.testCases[idx] = {...T.state.testCases[idx], output: text};
              this.forceUpdate();
            });
          });
        });
      });
    });
  }

  loadQuestionStatementText(text) {
    //this.refs.StatementEditor.value = text;
    this.questionStatementRef.current.value = text;
    this.setState({questionStatement: text});
  }

  ///////////////////////////////
  //                           //
  //  Question Designer utils  //
  //                           //
  ///////////////////////////////
  
  // Handles the addition of a test case to the dynamically rendered unit
  // tests.
  handleAddTestCase() {
    this.setState({
      testCases: this.state.testCases.concat([{input: '', output: ''}]),
      unsaved: true,
    });
  }

  // Handles the removal of a test case from the dynamically rendered unit
  // tests.
  // TODO: Refactor this function such that it is consistent with the other
  //       function declarations within this class (eg. such that it does not
  //       use arrow notation).
  //
  handleRemoveTestCase = (idx) => () => {
    this.setState({
      testCases: this.state.testCases.filter((tc, tcIdx) => (tcIdx !== idx)),
      unsaved: true,
    });
  }

  // Handles the changing of a dynamically rendered test case's input field.
  // TODO: Refactor this function such that it is consistent with the other
  //       function declarations within this class (eg. such that it does not
  //       use arrow notation).
  //
  handleTestCaseInputChange = (idx) => (event) => {
    const newTestCases = this.state.testCases.map((testCase, tcIdx) => {
      if (tcIdx !== idx) {
        return testCase;
      }
      return {...testCase, input: event.target.value};
    });
    this.setState({
      testCases: newTestCases,
      unsaved: true,
    });
  }

  // Handles the changing of a dynamically rendered test case's output field.
  // TODO: Refactor this function such that it is consistent with the other
  //       function declarations within this class (eg. such that it does not
  //       use arrow notation).
  //
  handleTestCaseOutputChange = (idx) => (event) => {
    const newTestCases = this.state.testCases.map((testCase, tcIdx) => {
      if (tcIdx !== idx) {
        return testCase;
      }
      return {...testCase, output: event.target.value};
    });
    this.setState({
      testCases: newTestCases,
      unsaved: true,
    });
  }

  // Handles a change of the question's statement.
  //
  handleStatementChange(event) {
    this.setState({
      questionStatement: event.target.value,
      unsaved: true,
    });
  }
  
  ////////////////////////////
  //                        //
  //     Firebase utils     //
  //                        //
  ////////////////////////////

  // Handles a save of the question and all appropriate test cases to the Cloud
  // Firestore.
  handleSaveToCloudFirestore() {
    const questionTitle = `Question ${this.state.selectedIndex}`;
    const testsRef = this.props.firebase.getStorageRef('tests/');
    const questionPath = this.testName + '/' + questionTitle + '/';
    testsRef.child(questionPath).delete().then(() => {
      // Deletion occurred successfully.
    }).catch((err) => {
      if (err.code !== 'storage/object-not-found') {
        console.error(err);
      }
    });
    // Now we write to the database...
    // Firstly, we write the inputs:
    for (const [idx, testCase] of this.state.testCases.entries()) {
      const inputsRef = testsRef.child(questionPath +
                                       `inputs/case_${idx}.txt`);
      inputsRef.put(stringToUint8Array(testCase.input), METADATA_TXT)
        .then(() => {
        console.log('Uploaded input to ' + inputsRef.fullPath);
      });

      const outputsRef = testsRef.child(questionPath +
                                        `outputs/case_${idx}.txt`);
      outputsRef.put(stringToUint8Array(testCase.output), METADATA_TXT)
        .then(() => {
        console.log('Uploaded output to ' + outputsRef.fullPath);
      });
    }
    // Then, we write the question statement.
    const questionRef = testsRef.child(questionPath + 'statement.txt');
    questionRef.put(stringToUint8Array(this.state.questionStatement),
                                       METADATA_TXT)
      .then(() => {
      console.log('Uploaded question statement to ' + questionRef.fullPath);
    });

    this.newQuestions.delete(this.state.selectedIndex);
  }

  /////////////////////////////
  //                         //
  //     Rendering utils     //
  //                         //
  /////////////////////////////

  // Renders the question designer to the right of the sidebar.
  // Test cases are initially rendered as HTML before being written below the
  // title editor, and question statement editor.
  //
  renderQuestionView() {
    if (this.state.loadingQuestionNames) {
      return (
        <div className="EditorWrapper" />
      )
    }

    const testCasesAsHtml = [];
    for (const [idx, testCase] of this.state.testCases.entries()) {
      testCasesAsHtml.push(
        <div className="TestCase" key={idx}>
          <div className="TestCaseHeaderButtonWrapper">
            <h3>
              Test Case {idx + 1}
            </h3>
            <button className="TestCaseDeleteButton"
                    onClick={this.handleRemoveTestCase(idx)}>
              Delete
            </button>
          </div>
          {testCase !== undefined &&
            <TextareaAutosize className="TestCaseInput"
                              placeholder="Input..."
                              onChange={this.handleTestCaseInputChange(idx)}
                              onResize={(e) => {}}
                              value={testCase.input}>
            </TextareaAutosize>
          }
          {testCase === undefined &&
            <p>loading input...</p>
          }
          {testCase !== undefined &&
            <TextareaAutosize className="TestCaseOutput"
                              placeholder="Output..."
                              onChange={this.handleTestCaseOutputChange(idx)}
                              onResize={(e) => {}}
                              value={testCase.output}>
            </TextareaAutosize>
          }
          {testCase === undefined &&
            <p>loading output...</p>
          }
        </div>
      );
    }

    return (
      <div className="EditorWrapper">
        <div className="QuestionTitleWrapper">
          <h1 className="QuestionTitleEditor">
            Question {this.state.selectedIndex}
          </h1>
          <button className="QuestionSaveButton"
                  onClick={this.handleSaveToCloudFirestore}>
            Save
          </button>
        </div>
        <div>
          <TextareaAutosize className="QuestionStatementEditor"
                            placeholder="Question Statement..."
                            onChange={this.handleStatementChange}
                            onResize={(e) => {}}
                            ref={this.questionStatementRef} />
        </div>
        <hr />
        <br />
        <h2 style={{'textAlign': 'left', 'marginBottom': '0.5em'}}>
          Test Cases
        </h2>
        {testCasesAsHtml}
        <div style={{'textAlign': 'center'}}>
          <button onClick={this.handleAddTestCase}>
            Add Test Case
          </button>
        </div>
      </div>
    );
  }

  // Renders the entirety of the page.
  // Question titles are rendered in the sidebar on the right of the screen,
  // creating a scrollbar on the sidebar if necessary; and wrapping around to
  // the width of the sidebar. This is done in order to preserve page content
  // and keep it legible.
  //
  render() {
    const questionsAsHtml = [];
    if (this.state.loadingQuestionNames) {
      questionsAsHtml.push(
        <div key={0}>
          loading...
        </div>
      )
    } else {
      for (const [idx, val] of this.state.questions.entries()) {
        questionsAsHtml.push(
          <div key={idx}>
            <button className="w3-bar-item w3-button"
                    onClick={this.handleSelectNewQuestion.bind(this, idx)}>
              {val}
            </button>
          </div>
        );
      }
    }

    return (
      <div>
        <div className="w3-sidebar w3-bar-block"
             style={SIDEBAR_STYLES_OVERRIDE}>
          <button className="w3-bar-item w3-button"
                  onClick={this.handleAddQuestion}
                  style={ADD_QUESTION_STYLES_OVERRIDE}>
            <b>Add Question</b>
          </button>
          {questionsAsHtml}
        </div>
        <div className="RightAlignedContent">
          {this.renderQuestionView()}
        </div>
      </div>
    );
  }
}

const condition = (authUser) => !!authUser;

export default withAuthorization(condition)(TestDesigner);
