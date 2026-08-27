import { render } from "preact";
import { App } from "./app/App";
import "./styles/theme.css";
import "./app/App.css";

render(<App />, document.getElementById("app")!);
