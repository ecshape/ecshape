"""Agent EC page actions (do_on_page) and Gemini compatibility."""
import json

from app.services import agent_ec
from app.services.ai_keys import Engine


def test_ui_task_effect_is_upgraded_for_risky_clicks():
    op = agent_ec._ui_task_op({"summary": "x", "effect": "none", "steps": [{"action": "click", "ref": "e3", "label": "Delete client"}]})
    assert op["kind"] == "ui.task" and op["effect"] == "danger"
    op = agent_ec._ui_task_op({"summary": "x", "effect": "none", "steps": [{"action": "fill", "ref": "e1", "label": "Name", "value": "Dana"},
                                                                         {"action": "click", "ref": "e2", "label": "Save"}]})
    assert op["effect"] == "change"
    op = agent_ec._ui_task_op({"summary": "x", "effect": "none", "steps": [{"action": "click", "ref": "e9", "label": "Menus tab"}]})
    assert op["effect"] == "none"


def test_ui_task_rejects_bad_steps():
    assert agent_ec._ui_task_op({"summary": "x", "effect": "change", "steps": []}) is None
    assert agent_ec._ui_task_op({"summary": "x", "effect": "change", "steps": [{"action": "eval", "ref": "e1", "label": "x"}]}) is None
    assert agent_ec._ui_task_op({"summary": "x", "effect": "change", "steps": [{"action": "click", "ref": "#id", "label": "x"}]}) is None
    assert agent_ec._ui_task_op({"summary": "x", "effect": "change", "steps": [{"action": "click", "label": "x"}]}) is None
    assert agent_ec._ui_task_op({"summary": "x", "effect": "none", "steps": [{"action": "press", "label": "Enter", "value": "Enter"}]})


def test_gemini_tools_have_no_unsupported_keywords():
    tools = agent_ec._openai_tools("google")
    assert "additionalProperties" not in json.dumps(tools)
    overview = next(t for t in tools if t["function"]["name"] == "studio_overview")
    assert "parameters" not in overview["function"]
    assert "additionalProperties" in json.dumps(agent_ec._openai_tools("openai"))


def test_retry_delay_parsing():
    assert agent_ec._retry_delay('{"retryDelay": "7s"}') == 7.0
    assert agent_ec._retry_delay("Please retry in 6.2s.") == 6.2
    assert agent_ec._retry_delay("nothing") is None


def test_page_steps_end_the_turn_and_gemini_tool_messages_carry_names(monkeypatch):
    calls = []
    replies = [
        {"choices": [{"message": {"content": "", "tool_calls": [
            {"id": "a", "type": "function", "function": {"name": "load_skill", "arguments": json.dumps({"name": "nope"})}}]}}]},
        {"choices": [{"message": {"content": "Prepared it. Shall I do it for you?", "tool_calls": [
            {"id": "b", "type": "function", "function": {"name": "do_on_page", "arguments": json.dumps({
                "summary": "Add a task", "effect": "change", "continue_after": True,
                "steps": [{"action": "fill", "ref": "e4", "label": "Task title", "value": "Call Dana"},
                          {"action": "click", "ref": "e5", "label": "Add"}]})}}]}}]},
    ]

    def fake_post(url, key, payload, retry_on_rate_limit=False):
        calls.append((payload, retry_on_rate_limit))
        return replies[len(calls) - 1]

    monkeypatch.setattr(agent_ec, "_post_json", fake_post)
    monkeypatch.setattr(agent_ec, "_run_read_tool", lambda db, user, name, args: {"error": "Unknown skill"})
    ops = []
    eng = Engine("google", "AIza-test-key-123", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta/openai", "user")
    reply = agent_ec._run_openai_compatible(eng, None, None, "sys", [{"role": "user", "content": "add a task to call Dana"}], ops)
    assert reply == "Prepared it. Shall I do it for you?"
    assert len(calls) == 2 and all(r for _, r in calls)  # Gemini: a rate limit is retried once
    tool_msgs = [m for m in calls[1][0]["messages"] if m["role"] == "tool"]
    assert tool_msgs and tool_msgs[0]["name"] == "load_skill"
    assert ops == [{"kind": "ui.task", "summary": "Add a task", "effect": "change", "continueAfter": True, "steps": [
        {"action": "fill", "ref": "e4", "label": "Task title", "value": "Call Dana", "say": ""},
        {"action": "click", "ref": "e5", "label": "Add", "value": "", "say": ""}]}]
