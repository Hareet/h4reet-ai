# Data-flow disclosure

A fixture for rule RL4: row V2 says the reply carries its route, but not the turn's estimated cost.

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off | FR |
|---|---|---|---|---|---|---|---|---|
| V2 | the stack → the visitor's browser, in each turn's reply | a conversation turn | the reply's text and its route | anything new leaving the device | the conversation | with the conversation | close the conversation | FR-075 |
