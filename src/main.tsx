import { render } from "preact";
import { App } from "./app/App";
import "@leonardschwier/leoforma/tokens.css";
import "@leonardschwier/leoforma/fonts.css";
import "@leonardschwier/leoforma/components.css";
import "./styles/theme.css";
import "./app/App.css";
import "./styles/nordic.css";
import "./styles/mermaid.css";

render(<App />, document.getElementById("app")!);
