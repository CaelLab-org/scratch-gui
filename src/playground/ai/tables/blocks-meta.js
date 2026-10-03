/* 自动生成，请勿手改：由 build-tables.mjs 从 scratch-blocks 的积木定义、scratch-vm 的扩展定义、parse-sb3-blocks 的翻译键、default_toolbox.xml 抽出 */
export default {
 "_generated": "2026-10-03",
 "_source": "scratch-blocks 积木定义 + scratch-vm 扩展定义 + parse-sb3-blocks 翻译键 + default_toolbox.xml（自动生成，勿手改）",
 "idToOpcode": {
  "MOTION_MOVESTEPS": "motion_movesteps",
  "MOTION_TURNRIGHT": "motion_turnright",
  "MOTION_TURNLEFT": "motion_turnleft",
  "MOTION_POINTINDIRECTION": "motion_pointindirection",
  "MOTION_POINTTOWARDS": "motion_pointtowards",
  "MOTION_GOTOXY": "motion_gotoxy",
  "MOTION_GOTO": "motion_goto",
  "MOTION_GLIDESECSTOXY": "motion_glidesecstoxy",
  "MOTION_GLIDETO": "motion_glideto",
  "MOTION_CHANGEXBY": "motion_changexby",
  "MOTION_SETX": "motion_setx",
  "MOTION_CHANGEYBY": "motion_changeyby",
  "MOTION_SETY": "motion_sety",
  "MOTION_IFONEDGEBOUNCE": "motion_ifonedgebounce",
  "MOTION_SETROTATIONSTYLE": "motion_setrotationstyle",
  "MOTION_XPOSITION": "motion_xposition",
  "MOTION_YPOSITION": "motion_yposition",
  "MOTION_DIRECTION": "motion_direction",
  "LOOKS_SAYFORSECS": "looks_sayforsecs",
  "LOOKS_SAY": "looks_say",
  "LOOKS_THINKFORSECS": "looks_thinkforsecs",
  "LOOKS_THINK": "looks_think",
  "LOOKS_SHOW": "looks_show",
  "LOOKS_HIDE": "looks_hide",
  "LOOKS_CHANGEEFFECTBY": "looks_changeeffectby",
  "LOOKS_SETEFFECTTO": "looks_seteffectto",
  "LOOKS_CLEARGRAPHICEFFECTS": "looks_cleargraphiceffects",
  "LOOKS_CHANGESIZEBY": "looks_changesizeby",
  "LOOKS_SETSIZETO": "looks_setsizeto",
  "LOOKS_SIZE": "looks_size",
  "LOOKS_SWITCHCOSTUMETO": "looks_switchcostumeto",
  "LOOKS_NEXTCOSTUME": "looks_nextcostume",
  "LOOKS_SWITCHBACKDROPTO": "looks_switchbackdropto",
  "LOOKS_GOTOFRONTBACK": "looks_gotofrontback",
  "LOOKS_GOFORWARDBACKWARDLAYERS": "looks_goforwardbackwardlayers",
  "LOOKS_BACKDROPNUMBERNAME": "looks_backdropnumbername",
  "LOOKS_COSTUMENUMBERNAME": "looks_costumenumbername",
  "LOOKS_SWITCHBACKDROPTOANDWAIT": "looks_switchbackdroptoandwait",
  "LOOKS_NEXTBACKDROP_BLOCK": "looks_nextbackdrop",
  "SOUND_PLAY": "sound_play",
  "SOUND_PLAYUNTILDONE": "sound_playuntildone",
  "SOUND_STOPALLSOUNDS": "sound_stopallsounds",
  "SOUND_SETEFFECTO": "sound_seteffectto",
  "SOUND_CHANGEEFFECTBY": "sound_changeeffectby",
  "SOUND_CLEAREFFECTS": "sound_cleareffects",
  "SOUND_CHANGEVOLUMEBY": "sound_changevolumeby",
  "SOUND_SETVOLUMETO": "sound_setvolumeto",
  "SOUND_VOLUME": "sound_volume",
  "EVENT_WHENFLAGCLICKED": "event_whenflagclicked",
  "EVENT_WHENTHISSPRITECLICKED": "event_whenthisspriteclicked",
  "EVENT_WHENSTAGECLICKED": "event_whenstageclicked",
  "EVENT_WHENBROADCASTRECEIVED": "event_whenbroadcastreceived",
  "EVENT_WHENBACKDROPSWITCHESTO": "event_whenbackdropswitchesto",
  "EVENT_WHENGREATERTHAN": "event_whengreaterthan",
  "EVENT_BROADCAST": "event_broadcast",
  "EVENT_BROADCASTANDWAIT": "event_broadcastandwait",
  "EVENT_WHENKEYPRESSED": "event_whenkeypressed",
  "CONTROL_FOREVER": "control_forever",
  "CONTROL_REPEAT": "control_repeat",
  "CONTROL_IF": "control_if",
  "CONTROL_ELSE": "control_else",
  "CONTROL_STOP": "control_stop",
  "CONTROL_WAIT": "control_wait",
  "CONTROL_WAITUNTIL": "control_wait_until",
  "CONTROL_REPEATUNTIL": "control_repeat_until",
  "CONTROL_STARTASCLONE": "control_start_as_clone",
  "CONTROL_CREATECLONEOF": "control_create_clone_of",
  "CONTROL_DELETETHISCLONE": "control_delete_this_clone",
  "SENSING_TOUCHINGOBJECT": "sensing_touchingobject",
  "SENSING_TOUCHINGCOLOR": "sensing_touchingcolor",
  "SENSING_COLORISTOUCHINGCOLOR": "sensing_coloristouchingcolor",
  "SENSING_DISTANCETO": "sensing_distanceto",
  "SENSING_ASKANDWAIT": "sensing_askandwait",
  "SENSING_ANSWER": "sensing_answer",
  "SENSING_KEYPRESSED": "sensing_keypressed",
  "SENSING_MOUSEDOWN": "sensing_mousedown",
  "SENSING_MOUSEX": "sensing_mousex",
  "SENSING_MOUSEY": "sensing_mousey",
  "SENSING_SETDRAGMODE": "sensing_setdragmode",
  "SENSING_LOUDNESS": "sensing_loudness",
  "SENSING_TIMER": "sensing_timer",
  "SENSING_RESETTIMER": "sensing_resettimer",
  "SENSING_OF": "sensing_of",
  "SENSING_CURRENT": "sensing_current",
  "SENSING_DAYSSINCE2000": "sensing_dayssince2000",
  "SENSING_USERNAME": "sensing_username",
  "OPERATORS_ADD": "operator_add",
  "OPERATORS_SUBTRACT": "operator_subtract",
  "OPERATORS_MULTIPLY": "operator_multiply",
  "OPERATORS_DIVIDE": "operator_divide",
  "OPERATORS_RANDOM": "operator_random",
  "OPERATORS_LT": "operator_lt",
  "OPERATORS_EQUALS": "operator_equals",
  "OPERATORS_GT": "operator_gt",
  "OPERATORS_AND": "operator_and",
  "OPERATORS_OR": "operator_or",
  "OPERATORS_NOT": "operator_not",
  "OPERATORS_JOIN": "operator_join",
  "OPERATORS_LETTEROF": "operator_letter_of",
  "OPERATORS_LENGTH": "operator_length",
  "OPERATORS_CONTAINS": "operator_contains",
  "OPERATORS_MOD": "operator_mod",
  "OPERATORS_ROUND": "operator_round",
  "OPERATORS_MATHOP": "operator_mathop",
  "DATA_VARIABLE": "data_variable",
  "DATA_SETVARIABLETO": "data_setvariableto",
  "DATA_CHANGEVARIABLEBY": "data_changevariableby",
  "DATA_SHOWVARIABLE": "data_showvariable",
  "DATA_HIDEVARIABLE": "data_hidevariable",
  "DATA_LISTCONTENTS": "data_listcontents",
  "DATA_ADDTOLIST": "data_addtolist",
  "DATA_DELETEOFLIST": "data_deleteoflist",
  "DATA_DELETEALLOFLIST": "data_deletealloflist",
  "DATA_INSERTATLIST": "data_insertatlist",
  "DATA_REPLACEITEMOFLIST": "data_replaceitemoflist",
  "DATA_ITEMOFLIST": "data_itemoflist",
  "DATA_ITEMNUMOFLIST": "data_itemnumoflist",
  "DATA_LENGTHOFLIST": "data_lengthoflist",
  "DATA_LISTCONTAINSITEM": "data_listcontainsitem",
  "DATA_SHOWLIST": "data_showlist",
  "DATA_HIDELIST": "data_hidelist",
  "PROCEDURES_DEFINITION": "procedures_definition",
  "PROCEDURES_CALL": "procedures_call",
  "ARGUMENT_REPORTER_BOOLEAN": "argument_reporter_boolean",
  "ARGUMENT_REPORTER_STRING_NUMBER": "argument_reporter_string_number",
  "pen.clear": "pen_clear",
  "pen.stamp": "pen_stamp",
  "pen.penDown": "pen_penDown",
  "pen.penUp": "pen_penUp",
  "pen.setColor": "pen_setPenColorToColor",
  "pen.changeColorParam": "pen_changePenColorParamBy",
  "pen.setColorParam": "pen_setPenColorParamTo",
  "pen.changeSize": "pen_changePenSizeBy",
  "pen.setSize": "pen_setPenSizeTo",
  "music.playDrumForBeats": "music_playDrumForBeats",
  "music.restForBeats": "music_restForBeats",
  "music.playNoteForBeats": "music_playNoteForBeats",
  "music.setInstrument": "music_setInstrument",
  "music.setTempo": "music_setTempo",
  "music.changeTempo": "music_changeTempo",
  "music.getTempo": "music_getTempo",
  "videoSensing.whenMotionGreaterThan": "videoSensing_whenMotionGreaterThan",
  "videoSensing.videoOn": "videoSensing_videoOn",
  "videoSensing.videoToggle": "videoSensing_videoToggle",
  "videoSensing.setVideoTransparency": "videoSensing_setVideoTransparency",
  "text2speech.speakAndWaitBlock": "text2speech_speakAndWait",
  "text2speech.setVoiceBlock": "text2speech_setVoice",
  "text2speech.setLanguageBlock": "text2speech_setLanguage",
  "translate.translateBlock": "translate_getTranslate",
  "translate.viewerLanguage": "translate_getViewerLanguage",
  "boost.motorOnFor": "boost_motorOnFor",
  "boost.motorOnForRotation": "boost_motorOnForRotation",
  "boost.motorOn": "boost_motorOn",
  "boost.motorOff": "boost_motorOff",
  "boost.setMotorPower": "boost_setMotorPower",
  "boost.setMotorDirection": "boost_setMotorDirection",
  "boost.getMotorPosition": "boost_getMotorPosition",
  "boost.whenColor": "boost_whenColor",
  "boost.seeingColor": "boost_seeingColor",
  "boost.whenTilted": "boost_whenTilted",
  "boost.getTiltAngle": "boost_getTiltAngle",
  "boost.setLightHue": "boost_setLightHue",
  "ev3.motorTurnClockwise": "ev3_motorTurnClockwise",
  "ev3.motorTurnCounterClockwise": "ev3_motorTurnCounterClockwise",
  "ev3.motorSetPower": "ev3_motorSetPower",
  "ev3.getMotorPosition": "ev3_getMotorPosition",
  "ev3.whenButtonPressed": "ev3_whenButtonPressed",
  "ev3.whenDistanceLessThan": "ev3_whenDistanceLessThan",
  "ev3.whenBrightnessLessThan": "ev3_whenBrightnessLessThan",
  "ev3.buttonPressed": "ev3_buttonPressed",
  "ev3.getDistance": "ev3_getDistance",
  "ev3.getBrightness": "ev3_getBrightness",
  "ev3.beepNote": "ev3_beep",
  "gdxfor.whenGesture": "gdxfor_whenGesture",
  "gdxfor.whenForcePushedOrPulled": "gdxfor_whenForcePushedOrPulled",
  "gdxfor.getForce": "gdxfor_getForce",
  "gdxfor.whenTilted": "gdxfor_whenTilted",
  "gdxfor.isTilted": "gdxfor_isTilted",
  "gdxfor.getTilt": "gdxfor_getTilt",
  "gdxfor.isFreeFalling": "gdxfor_isFreeFalling",
  "gdxfor.getSpin": "gdxfor_getSpinSpeed",
  "gdxfor.getAcceleration": "gdxfor_getAcceleration",
  "makeymakey.whenKeyPressed": "makeymakey_whenMakeyKeyPressed",
  "makeymakey.whenKeysPressedInOrder": "makeymakey_whenCodePressed",
  "microbit.whenButtonPressed": "microbit_whenButtonPressed",
  "microbit.isButtonPressed": "microbit_isButtonPressed",
  "microbit.whenGesture": "microbit_whenGesture",
  "microbit.displaySymbol": "microbit_displaySymbol",
  "microbit.displayText": "microbit_displayText",
  "microbit.clearDisplay": "microbit_displayClear",
  "microbit.whenTilted": "microbit_whenTilted",
  "microbit.isTilted": "microbit_isTilted",
  "microbit.tiltAngle": "microbit_getTiltAngle",
  "microbit.whenPinConnected": "microbit_whenPinConnected",
  "wedo2.motorOnFor": "wedo2_motorOnFor",
  "wedo2.motorOn": "wedo2_motorOn",
  "wedo2.motorOff": "wedo2_motorOff",
  "wedo2.startMotorPower": "wedo2_startMotorPower",
  "wedo2.setMotorDirection": "wedo2_setMotorDirection",
  "wedo2.setLightHue": "wedo2_setLightHue",
  "wedo2.playNoteFor": "wedo2_playNoteFor",
  "wedo2.whenDistance": "wedo2_whenDistance",
  "wedo2.whenTilted": "wedo2_whenTilted",
  "wedo2.getDistance": "wedo2_getDistance",
  "wedo2.isTilted": "wedo2_isTilted",
  "wedo2.getTiltAngle": "wedo2_getTiltAngle",
  "pen.setShade": "pen_setPenShadeToNumber",
  "pen.changeShade": "pen_changePenShadeBy",
  "pen.changeHue": "pen_changePenHueBy"
 },
 "spec": {
  "boost_motorOnFor": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "DURATION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "DURATION"
   ]
  },
  "boost_motorOnForRotation": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "ROTATION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "ROTATION"
   ]
  },
  "boost_motorOn": {
   "inputs": {
    "MOTOR_ID": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID"
   ]
  },
  "boost_motorOff": {
   "inputs": {
    "MOTOR_ID": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID"
   ]
  },
  "boost_setMotorPower": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "POWER": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "POWER"
   ]
  },
  "boost_setMotorDirection": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "MOTOR_DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "MOTOR_DIRECTION"
   ]
  },
  "boost_getMotorPosition": {
   "inputs": {
    "MOTOR_REPORTER_ID": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_REPORTER_ID"
   ]
  },
  "boost_whenColor": {
   "inputs": {
    "COLOR": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR"
   ]
  },
  "boost_seeingColor": {
   "inputs": {
    "COLOR": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR"
   ]
  },
  "boost_whenTilted": {
   "inputs": {
    "TILT_DIRECTION_ANY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT_DIRECTION_ANY"
   ]
  },
  "boost_getTiltAngle": {
   "inputs": {
    "TILT_DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT_DIRECTION"
   ]
  },
  "boost_setLightHue": {
   "inputs": {
    "HUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "HUE"
   ]
  },
  "ev3_motorTurnClockwise": {
   "inputs": {
    "PORT": "input_value",
    "TIME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT",
    "TIME"
   ]
  },
  "ev3_motorTurnCounterClockwise": {
   "inputs": {
    "PORT": "input_value",
    "TIME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT",
    "TIME"
   ]
  },
  "ev3_motorSetPower": {
   "inputs": {
    "PORT": "input_value",
    "POWER": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT",
    "POWER"
   ]
  },
  "ev3_getMotorPosition": {
   "inputs": {
    "PORT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT"
   ]
  },
  "ev3_whenButtonPressed": {
   "inputs": {
    "PORT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT"
   ]
  },
  "ev3_whenDistanceLessThan": {
   "inputs": {
    "DISTANCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DISTANCE"
   ]
  },
  "ev3_whenBrightnessLessThan": {
   "inputs": {
    "DISTANCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DISTANCE"
   ]
  },
  "ev3_buttonPressed": {
   "inputs": {
    "PORT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PORT"
   ]
  },
  "ev3_getDistance": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "ev3_getBrightness": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "ev3_beep": {
   "inputs": {
    "NOTE": "input_value",
    "TIME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NOTE",
    "TIME"
   ]
  },
  "gdxfor_whenGesture": {
   "inputs": {
    "GESTURE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "GESTURE"
   ]
  },
  "gdxfor_whenForcePushedOrPulled": {
   "inputs": {
    "PUSH_PULL": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PUSH_PULL"
   ]
  },
  "gdxfor_getForce": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "gdxfor_whenTilted": {
   "inputs": {
    "TILT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT"
   ]
  },
  "gdxfor_isTilted": {
   "inputs": {
    "TILT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT"
   ]
  },
  "gdxfor_getTilt": {
   "inputs": {
    "TILT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT"
   ]
  },
  "gdxfor_isFreeFalling": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "gdxfor_getSpinSpeed": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "gdxfor_getAcceleration": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "makeymakey_whenMakeyKeyPressed": {
   "inputs": {
    "KEY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "KEY"
   ]
  },
  "makeymakey_whenCodePressed": {
   "inputs": {
    "SEQUENCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SEQUENCE"
   ]
  },
  "microbit_whenButtonPressed": {
   "inputs": {
    "BTN": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BTN"
   ]
  },
  "microbit_isButtonPressed": {
   "inputs": {
    "BTN": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BTN"
   ]
  },
  "microbit_whenGesture": {
   "inputs": {
    "GESTURE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "GESTURE"
   ]
  },
  "microbit_displaySymbol": {
   "inputs": {
    "MATRIX": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MATRIX"
   ]
  },
  "microbit_displayText": {
   "inputs": {
    "TEXT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TEXT"
   ]
  },
  "microbit_displayClear": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "microbit_whenTilted": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "microbit_isTilted": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "microbit_getTiltAngle": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "microbit_whenPinConnected": {
   "inputs": {
    "PIN": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PIN"
   ]
  },
  "music_playDrumForBeats": {
   "inputs": {
    "DRUM": "input_value",
    "BEATS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DRUM",
    "BEATS"
   ]
  },
  "music_midiPlayDrumForBeats": {
   "inputs": {
    "DRUM": "input_value",
    "BEATS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DRUM",
    "BEATS"
   ]
  },
  "music_restForBeats": {
   "inputs": {
    "BEATS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BEATS"
   ]
  },
  "music_playNoteForBeats": {
   "inputs": {
    "NOTE": "input_value",
    "BEATS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NOTE",
    "BEATS"
   ]
  },
  "music_setInstrument": {
   "inputs": {
    "INSTRUMENT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "INSTRUMENT"
   ]
  },
  "music_midiSetInstrument": {
   "inputs": {
    "INSTRUMENT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "INSTRUMENT"
   ]
  },
  "music_setTempo": {
   "inputs": {
    "TEMPO": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TEMPO"
   ]
  },
  "music_changeTempo": {
   "inputs": {
    "TEMPO": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TEMPO"
   ]
  },
  "music_getTempo": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "pen_clear": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "pen_stamp": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "pen_penDown": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "pen_penUp": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "pen_setPenColorToColor": {
   "inputs": {
    "COLOR": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR"
   ]
  },
  "pen_changePenColorParamBy": {
   "inputs": {
    "COLOR_PARAM": "input_value",
    "VALUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR_PARAM",
    "VALUE"
   ]
  },
  "pen_setPenColorParamTo": {
   "inputs": {
    "COLOR_PARAM": "input_value",
    "VALUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR_PARAM",
    "VALUE"
   ]
  },
  "pen_changePenSizeBy": {
   "inputs": {
    "SIZE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SIZE"
   ]
  },
  "pen_setPenSizeTo": {
   "inputs": {
    "SIZE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SIZE"
   ]
  },
  "pen_setPenShadeToNumber": {
   "inputs": {
    "SHADE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SHADE"
   ]
  },
  "pen_changePenShadeBy": {
   "inputs": {
    "SHADE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SHADE"
   ]
  },
  "pen_setPenHueToNumber": {
   "inputs": {
    "HUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "HUE"
   ]
  },
  "pen_changePenHueBy": {
   "inputs": {
    "HUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "HUE"
   ]
  },
  "speech2text_listenAndWait": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "speech2text_whenIHearHat": {
   "inputs": {
    "PHRASE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "PHRASE"
   ]
  },
  "speech2text_getSpeech": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "text2speech_speakAndWait": {
   "inputs": {
    "WORDS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "WORDS"
   ]
  },
  "text2speech_setVoice": {
   "inputs": {
    "VOICE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "VOICE"
   ]
  },
  "text2speech_setLanguage": {
   "inputs": {
    "LANGUAGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "LANGUAGE"
   ]
  },
  "translate_getTranslate": {
   "inputs": {
    "WORDS": "input_value",
    "LANGUAGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "WORDS",
    "LANGUAGE"
   ]
  },
  "translate_getViewerLanguage": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "videoSensing_whenMotionGreaterThan": {
   "inputs": {
    "REFERENCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "REFERENCE"
   ]
  },
  "videoSensing_videoOn": {
   "inputs": {
    "ATTRIBUTE": "input_value",
    "SUBJECT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "ATTRIBUTE",
    "SUBJECT"
   ]
  },
  "videoSensing_videoToggle": {
   "inputs": {
    "VIDEO_STATE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "VIDEO_STATE"
   ]
  },
  "videoSensing_setVideoTransparency": {
   "inputs": {
    "TRANSPARENCY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TRANSPARENCY"
   ]
  },
  "wedo2_motorOnFor": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "DURATION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "DURATION"
   ]
  },
  "wedo2_motorOn": {
   "inputs": {
    "MOTOR_ID": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID"
   ]
  },
  "wedo2_motorOff": {
   "inputs": {
    "MOTOR_ID": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID"
   ]
  },
  "wedo2_startMotorPower": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "POWER": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "POWER"
   ]
  },
  "wedo2_setMotorDirection": {
   "inputs": {
    "MOTOR_ID": "input_value",
    "MOTOR_DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOTOR_ID",
    "MOTOR_DIRECTION"
   ]
  },
  "wedo2_setLightHue": {
   "inputs": {
    "HUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "HUE"
   ]
  },
  "wedo2_playNoteFor": {
   "inputs": {
    "NOTE": "input_value",
    "DURATION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NOTE",
    "DURATION"
   ]
  },
  "wedo2_whenDistance": {
   "inputs": {
    "OP": "input_value",
    "REFERENCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OP",
    "REFERENCE"
   ]
  },
  "wedo2_whenTilted": {
   "inputs": {
    "TILT_DIRECTION_ANY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT_DIRECTION_ANY"
   ]
  },
  "wedo2_getDistance": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "wedo2_isTilted": {
   "inputs": {
    "TILT_DIRECTION_ANY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT_DIRECTION_ANY"
   ]
  },
  "wedo2_getTiltAngle": {
   "inputs": {
    "TILT_DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT_DIRECTION"
   ]
  },
  "tw_getLastKeyPressed": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "tw_getButtonIsDown": {
   "inputs": {
    "MOUSE_BUTTON": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MOUSE_BUTTON"
   ]
  },
  "control_forever": {
   "inputs": {},
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": []
  },
  "control_repeat": {
   "inputs": {
    "TIMES": "input_value"
   },
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": [
    "TIMES"
   ]
  },
  "control_if": {
   "inputs": {
    "CONDITION": "input_value"
   },
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": [
    "CONDITION"
   ]
  },
  "control_if_else": {
   "inputs": {
    "CONDITION": "input_value"
   },
   "fields": {},
   "substacks": [
    "SUBSTACK",
    "SUBSTACK2"
   ],
   "order": [
    "CONDITION"
   ]
  },
  "control_stop": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_wait": {
   "inputs": {
    "DURATION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DURATION"
   ]
  },
  "control_wait_until": {
   "inputs": {
    "CONDITION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "CONDITION"
   ]
  },
  "control_repeat_until": {
   "inputs": {
    "CONDITION": "input_value"
   },
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": [
    "CONDITION"
   ]
  },
  "control_while": {
   "inputs": {
    "CONDITION": "input_value"
   },
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": [
    "CONDITION"
   ]
  },
  "control_for_each": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "VARIABLE": "field_variable"
   },
   "substacks": [
    "SUBSTACK"
   ],
   "order": [
    "VARIABLE",
    "VALUE"
   ]
  },
  "control_start_as_clone": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_create_clone_of_menu": {
   "inputs": {},
   "fields": {
    "CLONE_OPTION": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "CLONE_OPTION"
   ]
  },
  "control_create_clone_of": {
   "inputs": {
    "CLONE_OPTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "CLONE_OPTION"
   ]
  },
  "control_delete_this_clone": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_get_counter": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_incr_counter": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_clear_counter": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "control_all_at_once": {
   "inputs": {},
   "fields": {},
   "substacks": [
    "SUBSTACK"
   ],
   "order": []
  },
  "data_variable": {
   "inputs": {},
   "fields": {
    "VARIABLE": "field_variable_getter"
   },
   "substacks": [],
   "order": [
    "VARIABLE"
   ]
  },
  "data_setvariableto": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "VARIABLE": "field_variable"
   },
   "substacks": [],
   "order": [
    "VARIABLE",
    "VALUE"
   ]
  },
  "data_changevariableby": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "VARIABLE": "field_variable"
   },
   "substacks": [],
   "order": [
    "VARIABLE",
    "VALUE"
   ]
  },
  "data_showvariable": {
   "inputs": {},
   "fields": {
    "VARIABLE": "field_variable"
   },
   "substacks": [],
   "order": [
    "VARIABLE"
   ]
  },
  "data_hidevariable": {
   "inputs": {},
   "fields": {
    "VARIABLE": "field_variable"
   },
   "substacks": [],
   "order": [
    "VARIABLE"
   ]
  },
  "data_listcontents": {
   "inputs": {},
   "fields": {
    "LIST": "field_variable_getter"
   },
   "substacks": [],
   "order": [
    "LIST"
   ]
  },
  "data_listindexall": {
   "inputs": {},
   "fields": {
    "INDEX": "field_numberdropdown"
   },
   "substacks": [],
   "order": [
    "INDEX"
   ]
  },
  "data_listindexrandom": {
   "inputs": {},
   "fields": {
    "INDEX": "field_numberdropdown"
   },
   "substacks": [],
   "order": [
    "INDEX"
   ]
  },
  "data_addtolist": {
   "inputs": {
    "ITEM": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "ITEM",
    "LIST"
   ]
  },
  "data_deleteoflist": {
   "inputs": {
    "INDEX": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "INDEX",
    "LIST"
   ]
  },
  "data_deletealloflist": {
   "inputs": {},
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "LIST"
   ]
  },
  "data_insertatlist": {
   "inputs": {
    "ITEM": "input_value",
    "INDEX": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "ITEM",
    "INDEX",
    "LIST"
   ]
  },
  "data_replaceitemoflist": {
   "inputs": {
    "INDEX": "input_value",
    "ITEM": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "INDEX",
    "LIST",
    "ITEM"
   ]
  },
  "data_itemoflist": {
   "inputs": {
    "INDEX": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "INDEX",
    "LIST"
   ]
  },
  "data_itemnumoflist": {
   "inputs": {
    "ITEM": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "ITEM",
    "LIST"
   ]
  },
  "data_lengthoflist": {
   "inputs": {},
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "LIST"
   ]
  },
  "data_listcontainsitem": {
   "inputs": {
    "ITEM": "input_value"
   },
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "LIST",
    "ITEM"
   ]
  },
  "data_showlist": {
   "inputs": {},
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "LIST"
   ]
  },
  "data_hidelist": {
   "inputs": {},
   "fields": {
    "LIST": "field_variable"
   },
   "substacks": [],
   "order": [
    "LIST"
   ]
  },
  "defaultToolbox": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "event_whentouchingobject": {
   "inputs": {
    "TOUCHINGOBJECTMENU": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TOUCHINGOBJECTMENU"
   ]
  },
  "event_touchingobjectmenu": {
   "inputs": {},
   "fields": {
    "TOUCHINGOBJECTMENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TOUCHINGOBJECTMENU"
   ]
  },
  "event_whenflagclicked": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "event_whenthisspriteclicked": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "event_whenstageclicked": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "event_whenbroadcastreceived": {
   "inputs": {},
   "fields": {
    "BROADCAST_OPTION": "field_variable"
   },
   "substacks": [],
   "order": [
    "BROADCAST_OPTION"
   ]
  },
  "event_whenbackdropswitchesto": {
   "inputs": {},
   "fields": {
    "BACKDROP": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "BACKDROP"
   ]
  },
  "event_whengreaterthan": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "WHENGREATERTHANMENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "WHENGREATERTHANMENU",
    "VALUE"
   ]
  },
  "event_broadcast_menu": {
   "inputs": {},
   "fields": {
    "BROADCAST_OPTION": "field_variable"
   },
   "substacks": [],
   "order": [
    "BROADCAST_OPTION"
   ]
  },
  "event_broadcast": {
   "inputs": {
    "BROADCAST_INPUT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BROADCAST_INPUT"
   ]
  },
  "event_broadcastandwait": {
   "inputs": {
    "BROADCAST_INPUT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BROADCAST_INPUT"
   ]
  },
  "event_whenkeypressed": {
   "inputs": {},
   "fields": {
    "KEY_OPTION": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "KEY_OPTION"
   ]
  },
  "extension_pen_down": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "extension_music_drum": {
   "inputs": {
    "NUMBER": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUMBER"
   ]
  },
  "extension_wedo_motor": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "extension_wedo_hat": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "extension_wedo_boolean": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "extension_wedo_tilt_reporter": {
   "inputs": {
    "TILT": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TILT"
   ]
  },
  "extension_wedo_tilt_menu": {
   "inputs": {},
   "fields": {
    "TILT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TILT"
   ]
  },
  "extension_music_reporter": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "extension_microbit_display": {
   "inputs": {
    "MATRIX": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MATRIX"
   ]
  },
  "extension_music_play_note": {
   "inputs": {
    "NOTE": "input_value",
    "BEATS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NOTE",
    "BEATS"
   ]
  },
  "looks_sayforsecs": {
   "inputs": {
    "MESSAGE": "input_value",
    "SECS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MESSAGE",
    "SECS"
   ]
  },
  "looks_say": {
   "inputs": {
    "MESSAGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MESSAGE"
   ]
  },
  "looks_thinkforsecs": {
   "inputs": {
    "MESSAGE": "input_value",
    "SECS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MESSAGE",
    "SECS"
   ]
  },
  "looks_think": {
   "inputs": {
    "MESSAGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "MESSAGE"
   ]
  },
  "looks_show": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_hide": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_hideallsprites": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_changeeffectby": {
   "inputs": {
    "CHANGE": "input_value"
   },
   "fields": {
    "EFFECT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "EFFECT",
    "CHANGE"
   ]
  },
  "looks_seteffectto": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "EFFECT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "EFFECT",
    "VALUE"
   ]
  },
  "looks_cleargraphiceffects": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_changesizeby": {
   "inputs": {
    "CHANGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "CHANGE"
   ]
  },
  "looks_setsizeto": {
   "inputs": {
    "SIZE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SIZE"
   ]
  },
  "looks_size": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_changestretchby": {
   "inputs": {
    "CHANGE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "CHANGE"
   ]
  },
  "looks_setstretchto": {
   "inputs": {
    "STRETCH": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "STRETCH"
   ]
  },
  "looks_costume": {
   "inputs": {},
   "fields": {
    "COSTUME": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "COSTUME"
   ]
  },
  "looks_switchcostumeto": {
   "inputs": {
    "COSTUME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COSTUME"
   ]
  },
  "looks_nextcostume": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "looks_switchbackdropto": {
   "inputs": {
    "BACKDROP": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BACKDROP"
   ]
  },
  "looks_backdrops": {
   "inputs": {},
   "fields": {
    "BACKDROP": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "BACKDROP"
   ]
  },
  "looks_gotofrontback": {
   "inputs": {},
   "fields": {
    "FRONT_BACK": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "FRONT_BACK"
   ]
  },
  "looks_goforwardbackwardlayers": {
   "inputs": {
    "NUM": "input_value"
   },
   "fields": {
    "FORWARD_BACKWARD": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "FORWARD_BACKWARD",
    "NUM"
   ]
  },
  "looks_backdropnumbername": {
   "inputs": {},
   "fields": {
    "NUMBER_NAME": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "NUMBER_NAME"
   ]
  },
  "looks_costumenumbername": {
   "inputs": {},
   "fields": {
    "NUMBER_NAME": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "NUMBER_NAME"
   ]
  },
  "looks_switchbackdroptoandwait": {
   "inputs": {
    "BACKDROP": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "BACKDROP"
   ]
  },
  "looks_nextbackdrop": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_movesteps": {
   "inputs": {
    "STEPS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "STEPS"
   ]
  },
  "motion_turnright": {
   "inputs": {
    "DEGREES": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DEGREES"
   ]
  },
  "motion_turnleft": {
   "inputs": {
    "DEGREES": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DEGREES"
   ]
  },
  "motion_pointindirection": {
   "inputs": {
    "DIRECTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DIRECTION"
   ]
  },
  "motion_pointtowards_menu": {
   "inputs": {},
   "fields": {
    "TOWARDS": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TOWARDS"
   ]
  },
  "motion_pointtowards": {
   "inputs": {
    "TOWARDS": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TOWARDS"
   ]
  },
  "motion_goto_menu": {
   "inputs": {},
   "fields": {
    "TO": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TO"
   ]
  },
  "motion_gotoxy": {
   "inputs": {
    "X": "input_value",
    "Y": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "X",
    "Y"
   ]
  },
  "motion_goto": {
   "inputs": {
    "TO": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TO"
   ]
  },
  "motion_glidesecstoxy": {
   "inputs": {
    "SECS": "input_value",
    "X": "input_value",
    "Y": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SECS",
    "X",
    "Y"
   ]
  },
  "motion_glideto_menu": {
   "inputs": {},
   "fields": {
    "TO": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TO"
   ]
  },
  "motion_glideto": {
   "inputs": {
    "SECS": "input_value",
    "TO": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SECS",
    "TO"
   ]
  },
  "motion_changexby": {
   "inputs": {
    "DX": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DX"
   ]
  },
  "motion_setx": {
   "inputs": {
    "X": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "X"
   ]
  },
  "motion_changeyby": {
   "inputs": {
    "DY": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DY"
   ]
  },
  "motion_sety": {
   "inputs": {
    "Y": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "Y"
   ]
  },
  "motion_ifonedgebounce": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_setrotationstyle": {
   "inputs": {},
   "fields": {
    "STYLE": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "STYLE"
   ]
  },
  "motion_xposition": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_yposition": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_direction": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_scroll_right": {
   "inputs": {
    "DISTANCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DISTANCE"
   ]
  },
  "motion_scroll_up": {
   "inputs": {
    "DISTANCE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DISTANCE"
   ]
  },
  "motion_align_scene": {
   "inputs": {},
   "fields": {
    "ALIGNMENT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "ALIGNMENT"
   ]
  },
  "motion_xscroll": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "motion_yscroll": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "operator_add": {
   "inputs": {
    "NUM1": "input_value",
    "NUM2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM1",
    "NUM2"
   ]
  },
  "operator_subtract": {
   "inputs": {
    "NUM1": "input_value",
    "NUM2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM1",
    "NUM2"
   ]
  },
  "operator_multiply": {
   "inputs": {
    "NUM1": "input_value",
    "NUM2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM1",
    "NUM2"
   ]
  },
  "operator_divide": {
   "inputs": {
    "NUM1": "input_value",
    "NUM2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM1",
    "NUM2"
   ]
  },
  "operator_random": {
   "inputs": {
    "FROM": "input_value",
    "TO": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "FROM",
    "TO"
   ]
  },
  "operator_lt": {
   "inputs": {
    "OPERAND1": "input_value",
    "OPERAND2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND1",
    "OPERAND2"
   ]
  },
  "operator_equals": {
   "inputs": {
    "OPERAND1": "input_value",
    "OPERAND2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND1",
    "OPERAND2"
   ]
  },
  "operator_gt": {
   "inputs": {
    "OPERAND1": "input_value",
    "OPERAND2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND1",
    "OPERAND2"
   ]
  },
  "operator_and": {
   "inputs": {
    "OPERAND1": "input_value",
    "OPERAND2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND1",
    "OPERAND2"
   ]
  },
  "operator_or": {
   "inputs": {
    "OPERAND1": "input_value",
    "OPERAND2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND1",
    "OPERAND2"
   ]
  },
  "operator_not": {
   "inputs": {
    "OPERAND": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "OPERAND"
   ]
  },
  "operator_join": {
   "inputs": {
    "STRING1": "input_value",
    "STRING2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "STRING1",
    "STRING2"
   ]
  },
  "operator_letter_of": {
   "inputs": {
    "LETTER": "input_value",
    "STRING": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "LETTER",
    "STRING"
   ]
  },
  "operator_length": {
   "inputs": {
    "STRING": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "STRING"
   ]
  },
  "operator_contains": {
   "inputs": {
    "STRING1": "input_value",
    "STRING2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "STRING1",
    "STRING2"
   ]
  },
  "operator_mod": {
   "inputs": {
    "NUM1": "input_value",
    "NUM2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM1",
    "NUM2"
   ]
  },
  "operator_round": {
   "inputs": {
    "NUM": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "operator_mathop": {
   "inputs": {
    "NUM": "input_value"
   },
   "fields": {
    "OPERATOR": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "OPERATOR",
    "NUM"
   ]
  },
  "procedures_definition": {
   "inputs": {},
   "fields": {},
   "substacks": [
    "custom_block"
   ],
   "order": []
  },
  "procedures_call": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "procedures_prototype": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "procedures_declaration": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "argument_reporter_boolean": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "argument_reporter_string_number": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "argument_editor_boolean": {
   "inputs": {},
   "fields": {
    "TEXT": "field_input_removable"
   },
   "substacks": [],
   "order": [
    "TEXT"
   ]
  },
  "argument_editor_string_number": {
   "inputs": {},
   "fields": {
    "TEXT": "field_input_removable"
   },
   "substacks": [],
   "order": [
    "TEXT"
   ]
  },
  "procedures_return": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "VALUE"
   ]
  },
  "sensing_touchingobject": {
   "inputs": {
    "TOUCHINGOBJECTMENU": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "TOUCHINGOBJECTMENU"
   ]
  },
  "sensing_touchingobjectmenu": {
   "inputs": {},
   "fields": {
    "TOUCHINGOBJECTMENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "TOUCHINGOBJECTMENU"
   ]
  },
  "sensing_touchingcolor": {
   "inputs": {
    "COLOR": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR"
   ]
  },
  "sensing_coloristouchingcolor": {
   "inputs": {
    "COLOR": "input_value",
    "COLOR2": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "COLOR",
    "COLOR2"
   ]
  },
  "sensing_distanceto": {
   "inputs": {
    "DISTANCETOMENU": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "DISTANCETOMENU"
   ]
  },
  "sensing_distancetomenu": {
   "inputs": {},
   "fields": {
    "DISTANCETOMENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "DISTANCETOMENU"
   ]
  },
  "sensing_askandwait": {
   "inputs": {
    "QUESTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "QUESTION"
   ]
  },
  "sensing_answer": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_keypressed": {
   "inputs": {
    "KEY_OPTION": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "KEY_OPTION"
   ]
  },
  "sensing_keyoptions": {
   "inputs": {},
   "fields": {
    "KEY_OPTION": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "KEY_OPTION"
   ]
  },
  "sensing_mousedown": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_mousex": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_mousey": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_setdragmode": {
   "inputs": {},
   "fields": {
    "DRAG_MODE": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "DRAG_MODE"
   ]
  },
  "sensing_loudness": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_loud": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_timer": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_resettimer": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_of_object_menu": {
   "inputs": {},
   "fields": {
    "OBJECT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "OBJECT"
   ]
  },
  "sensing_of": {
   "inputs": {
    "OBJECT": "input_value"
   },
   "fields": {
    "PROPERTY": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "PROPERTY",
    "OBJECT"
   ]
  },
  "sensing_current": {
   "inputs": {},
   "fields": {
    "CURRENTMENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "CURRENTMENU"
   ]
  },
  "sensing_dayssince2000": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_username": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_userid": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sensing_online": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sound_sounds_menu": {
   "inputs": {},
   "fields": {
    "SOUND_MENU": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "SOUND_MENU"
   ]
  },
  "sound_play": {
   "inputs": {
    "SOUND_MENU": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SOUND_MENU"
   ]
  },
  "sound_playuntildone": {
   "inputs": {
    "SOUND_MENU": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "SOUND_MENU"
   ]
  },
  "sound_stopallsounds": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sound_seteffectto": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "EFFECT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "EFFECT",
    "VALUE"
   ]
  },
  "sound_changeeffectby": {
   "inputs": {
    "VALUE": "input_value"
   },
   "fields": {
    "EFFECT": "field_dropdown"
   },
   "substacks": [],
   "order": [
    "EFFECT",
    "VALUE"
   ]
  },
  "sound_cleareffects": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "sound_changevolumeby": {
   "inputs": {
    "VOLUME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "VOLUME"
   ]
  },
  "sound_setvolumeto": {
   "inputs": {
    "VOLUME": "input_value"
   },
   "fields": {},
   "substacks": [],
   "order": [
    "VOLUME"
   ]
  },
  "sound_volume": {
   "inputs": {},
   "fields": {},
   "substacks": [],
   "order": []
  },
  "colour_picker": {
   "inputs": {},
   "fields": {
    "COLOUR": "field_colour_slider"
   },
   "substacks": [],
   "order": [
    "COLOUR"
   ]
  },
  "math_number": {
   "inputs": {},
   "fields": {
    "NUM": "field_number"
   },
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "math_integer": {
   "inputs": {},
   "fields": {
    "NUM": "field_number"
   },
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "math_whole_number": {
   "inputs": {},
   "fields": {
    "NUM": "field_number"
   },
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "math_positive_number": {
   "inputs": {},
   "fields": {
    "NUM": "field_number"
   },
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "math_angle": {
   "inputs": {},
   "fields": {
    "NUM": "field_angle"
   },
   "substacks": [],
   "order": [
    "NUM"
   ]
  },
  "matrix": {
   "inputs": {},
   "fields": {
    "MATRIX": "field_matrix"
   },
   "substacks": [],
   "order": [
    "MATRIX"
   ]
  },
  "note": {
   "inputs": {},
   "fields": {
    "NOTE": "field_note"
   },
   "substacks": [],
   "order": [
    "NOTE"
   ]
  },
  "text": {
   "inputs": {},
   "fields": {
    "TEXT": "field_input"
   },
   "substacks": [],
   "order": [
    "TEXT"
   ]
  }
 },
 "shadows": {
  "motion_movesteps": {
   "STEPS": "math_number"
  },
  "motion_turnright": {
   "DEGREES": "math_number"
  },
  "motion_turnleft": {
   "DEGREES": "math_number"
  },
  "motion_pointindirection": {
   "DIRECTION": "math_angle"
  },
  "motion_pointtowards": {
   "TOWARDS": "motion_pointtowards_menu"
  },
  "motion_goto": {
   "TO": "motion_goto_menu"
  },
  "motion_glidesecstoxy": {
   "SECS": "math_number"
  },
  "motion_glideto": {
   "SECS": "math_number",
   "TO": "motion_glideto_menu"
  },
  "motion_changexby": {
   "DX": "math_number"
  },
  "motion_changeyby": {
   "DY": "math_number"
  },
  "looks_switchcostumeto": {
   "COSTUME": "looks_costume"
  },
  "looks_switchbackdropto": {
   "BACKDROP": "looks_backdrops"
  },
  "looks_switchbackdroptoandwait": {
   "BACKDROP": "looks_backdrops"
  },
  "looks_changeeffectby": {
   "CHANGE": "math_number"
  },
  "looks_seteffectto": {
   "VALUE": "math_number"
  },
  "looks_changesizeby": {
   "CHANGE": "math_number"
  },
  "looks_setsizeto": {
   "SIZE": "math_number"
  },
  "looks_goforwardbackwardlayers": {
   "NUM": "math_integer"
  },
  "sound_play": {
   "SOUND_MENU": "sound_sounds_menu"
  },
  "sound_playuntildone": {
   "SOUND_MENU": "sound_sounds_menu"
  },
  "sound_changeeffectby": {
   "VALUE": "math_number"
  },
  "sound_seteffectto": {
   "VALUE": "math_number"
  },
  "sound_changevolumeby": {
   "VOLUME": "math_number"
  },
  "sound_setvolumeto": {
   "VOLUME": "math_number"
  },
  "event_whengreaterthan": {
   "VALUE": "math_number"
  },
  "event_broadcast": {
   "BROADCAST_INPUT": "event_broadcast_menu"
  },
  "event_broadcastandwait": {
   "BROADCAST_INPUT": "event_broadcast_menu"
  },
  "control_wait": {
   "DURATION": "math_positive_number"
  },
  "control_repeat": {
   "TIMES": "math_whole_number"
  },
  "control_create_clone_of": {
   "CLONE_OPTION": "control_create_clone_of_menu"
  },
  "sensing_touchingobject": {
   "TOUCHINGOBJECTMENU": "sensing_touchingobjectmenu"
  },
  "sensing_touchingcolor": {
   "COLOR": "colour_picker"
  },
  "sensing_coloristouchingcolor": {
   "COLOR": "colour_picker",
   "COLOR2": "colour_picker"
  },
  "sensing_distanceto": {
   "DISTANCETOMENU": "sensing_distancetomenu"
  },
  "sensing_keypressed": {
   "KEY_OPTION": "sensing_keyoptions"
  },
  "sensing_of": {
   "OBJECT": "sensing_of_object_menu"
  },
  "operator_add": {
   "NUM1": "math_number",
   "NUM2": "math_number"
  },
  "operator_subtract": {
   "NUM1": "math_number",
   "NUM2": "math_number"
  },
  "operator_multiply": {
   "NUM1": "math_number",
   "NUM2": "math_number"
  },
  "operator_divide": {
   "NUM1": "math_number",
   "NUM2": "math_number"
  },
  "operator_random": {
   "FROM": "math_number",
   "TO": "math_number"
  },
  "operator_lt": {
   "OPERAND1": "text",
   "OPERAND2": "text"
  },
  "operator_equals": {
   "OPERAND1": "text",
   "OPERAND2": "text"
  },
  "operator_gt": {
   "OPERAND1": "text",
   "OPERAND2": "text"
  },
  "operator_join": {
   "STRING1": "text",
   "STRING2": "text"
  },
  "operator_letter_of": {
   "LETTER": "math_whole_number",
   "STRING": "text"
  },
  "operator_length": {
   "STRING": "text"
  },
  "operator_contains": {
   "STRING1": "text",
   "STRING2": "text"
  },
  "operator_mod": {
   "NUM1": "math_number",
   "NUM2": "math_number"
  },
  "operator_round": {
   "NUM": "math_number"
  },
  "operator_mathop": {
   "NUM": "math_number"
  },
  "extension_music_drum": {
   "NUMBER": "math_number"
  },
  "extension_wedo_tilt_reporter": {
   "TILT": "extension_wedo_tilt_menu"
  },
  "extension_microbit_display": {
   "MATRIX": "matrix"
  },
  "extension_music_play_note": {
   "NOTE": "note",
   "BEATS": "math_number"
  }
 },
 "menuShadowByArg": {
  "boost_motorOnFor": {
   "MOTOR_ID": "boost_menu_MOTOR_ID"
  },
  "boost_motorOnForRotation": {
   "MOTOR_ID": "boost_menu_MOTOR_ID"
  },
  "boost_motorOn": {
   "MOTOR_ID": "boost_menu_MOTOR_ID"
  },
  "boost_motorOff": {
   "MOTOR_ID": "boost_menu_MOTOR_ID"
  },
  "boost_setMotorPower": {
   "MOTOR_ID": "boost_menu_MOTOR_ID"
  },
  "boost_setMotorDirection": {
   "MOTOR_ID": "boost_menu_MOTOR_ID",
   "MOTOR_DIRECTION": "boost_menu_MOTOR_DIRECTION"
  },
  "boost_getMotorPosition": {
   "MOTOR_REPORTER_ID": "boost_menu_MOTOR_REPORTER_ID"
  },
  "boost_whenColor": {
   "COLOR": "boost_menu_COLOR"
  },
  "boost_seeingColor": {
   "COLOR": "boost_menu_COLOR"
  },
  "boost_whenTilted": {
   "TILT_DIRECTION_ANY": "boost_menu_TILT_DIRECTION_ANY"
  },
  "boost_getTiltAngle": {
   "TILT_DIRECTION": "boost_menu_TILT_DIRECTION"
  },
  "ev3_motorTurnClockwise": {
   "PORT": "ev3_menu_motorPorts"
  },
  "ev3_motorTurnCounterClockwise": {
   "PORT": "ev3_menu_motorPorts"
  },
  "ev3_motorSetPower": {
   "PORT": "ev3_menu_motorPorts"
  },
  "ev3_getMotorPosition": {
   "PORT": "ev3_menu_motorPorts"
  },
  "ev3_whenButtonPressed": {
   "PORT": "ev3_menu_sensorPorts"
  },
  "ev3_buttonPressed": {
   "PORT": "ev3_menu_sensorPorts"
  },
  "gdxfor_whenGesture": {
   "GESTURE": "gdxfor_menu_gestureOptions"
  },
  "gdxfor_whenForcePushedOrPulled": {
   "PUSH_PULL": "gdxfor_menu_pushPullOptions"
  },
  "gdxfor_whenTilted": {
   "TILT": "gdxfor_menu_tiltAnyOptions"
  },
  "gdxfor_isTilted": {
   "TILT": "gdxfor_menu_tiltAnyOptions"
  },
  "gdxfor_getTilt": {
   "TILT": "gdxfor_menu_tiltOptions"
  },
  "gdxfor_getSpinSpeed": {
   "DIRECTION": "gdxfor_menu_axisOptions"
  },
  "gdxfor_getAcceleration": {
   "DIRECTION": "gdxfor_menu_axisOptions"
  },
  "makeymakey_whenMakeyKeyPressed": {
   "KEY": "makeymakey_menu_KEY"
  },
  "makeymakey_whenCodePressed": {
   "SEQUENCE": "makeymakey_menu_SEQUENCE"
  },
  "microbit_whenButtonPressed": {
   "BTN": "microbit_menu_buttons"
  },
  "microbit_isButtonPressed": {
   "BTN": "microbit_menu_buttons"
  },
  "microbit_whenGesture": {
   "GESTURE": "microbit_menu_gestures"
  },
  "microbit_whenTilted": {
   "DIRECTION": "microbit_menu_tiltDirectionAny"
  },
  "microbit_isTilted": {
   "DIRECTION": "microbit_menu_tiltDirectionAny"
  },
  "microbit_getTiltAngle": {
   "DIRECTION": "microbit_menu_tiltDirection"
  },
  "microbit_whenPinConnected": {
   "PIN": "microbit_menu_touchPins"
  },
  "music_playDrumForBeats": {
   "DRUM": "music_menu_DRUM"
  },
  "music_midiPlayDrumForBeats": {
   "DRUM": "music_menu_DRUM"
  },
  "music_setInstrument": {
   "INSTRUMENT": "music_menu_INSTRUMENT"
  },
  "pen_changePenColorParamBy": {
   "COLOR_PARAM": "pen_menu_colorParam"
  },
  "pen_setPenColorParamTo": {
   "COLOR_PARAM": "pen_menu_colorParam"
  },
  "text2speech_setVoice": {
   "VOICE": "text2speech_menu_voices"
  },
  "text2speech_setLanguage": {
   "LANGUAGE": "text2speech_menu_languages"
  },
  "translate_getTranslate": {
   "LANGUAGE": "translate_menu_languages"
  },
  "videoSensing_videoOn": {
   "ATTRIBUTE": "videoSensing_menu_ATTRIBUTE",
   "SUBJECT": "videoSensing_menu_SUBJECT"
  },
  "videoSensing_videoToggle": {
   "VIDEO_STATE": "videoSensing_menu_VIDEO_STATE"
  },
  "wedo2_motorOnFor": {
   "MOTOR_ID": "wedo2_menu_MOTOR_ID"
  },
  "wedo2_motorOn": {
   "MOTOR_ID": "wedo2_menu_MOTOR_ID"
  },
  "wedo2_motorOff": {
   "MOTOR_ID": "wedo2_menu_MOTOR_ID"
  },
  "wedo2_startMotorPower": {
   "MOTOR_ID": "wedo2_menu_MOTOR_ID"
  },
  "wedo2_setMotorDirection": {
   "MOTOR_ID": "wedo2_menu_MOTOR_ID",
   "MOTOR_DIRECTION": "wedo2_menu_MOTOR_DIRECTION"
  },
  "wedo2_whenDistance": {
   "OP": "wedo2_menu_OP"
  },
  "wedo2_whenTilted": {
   "TILT_DIRECTION_ANY": "wedo2_menu_TILT_DIRECTION_ANY"
  },
  "wedo2_isTilted": {
   "TILT_DIRECTION_ANY": "wedo2_menu_TILT_DIRECTION_ANY"
  },
  "wedo2_getTiltAngle": {
   "TILT_DIRECTION": "wedo2_menu_TILT_DIRECTION"
  },
  "tw_getButtonIsDown": {
   "MOUSE_BUTTON": "tw_menu_mouseButton"
  }
 },
 "menuValues": {
  "0": "0",
  "1": "0",
  "2": "1",
  "3": "2",
  "4": "3",
  "A": "A",
  "B": "B",
  "C": "C",
  "D": "D",
  "AB": "AB",
  "ABCD": "ABCD",
  "this way": "this way",
  "that way": "that way",
  "reverse": "reverse",
  "up": "up",
  "down": "down",
  "left": "left",
  "right": "right",
  "any": "any",
  "red": "red",
  "blue": "blue",
  "green": "green",
  "yellow": "yellow",
  "white": "white",
  "black": "black",
  "any color": "any",
  "pushed": "pushed",
  "pulled": "pulled",
  "shaken": "shaken",
  "started falling": "started falling",
  "turned face up": "turned face up",
  "turned face down": "turned face down",
  "x": "x",
  "y": "y",
  "z": "z",
  "front": "front",
  "back": "back",
  "space": "SPACE",
  "up arrow": "UP",
  "down arrow": "DOWN",
  "right arrow": "RIGHT",
  "left arrow": "LEFT",
  "w": "w",
  "a": "a",
  "s": "s",
  "d": "d",
  "f": "f",
  "g": "g",
  "left up right": "LEFT UP RIGHT",
  "right up left": "RIGHT UP LEFT",
  "left right": "LEFT RIGHT",
  "right left": "RIGHT LEFT",
  "up down": "UP DOWN",
  "down up": "DOWN UP",
  "up right down left": "UP RIGHT DOWN LEFT",
  "up left down right": "UP LEFT DOWN RIGHT",
  "up up down down left right left right": "UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT",
  "moved": "moved",
  "jumped": "jumped",
  "on": "on",
  "off": "off",
  "(1) Snare Drum": "1",
  "(2) Bass Drum": "2",
  "(3) Side Stick": "3",
  "(4) Crash Cymbal": "4",
  "(5) Open Hi-Hat": "5",
  "(6) Closed Hi-Hat": "6",
  "(7) Tambourine": "7",
  "(8) Hand Clap": "8",
  "(9) Claves": "9",
  "(10) Wood Block": "10",
  "(11) Cowbell": "11",
  "(12) Triangle": "12",
  "(13) Bongo": "13",
  "(14) Conga": "14",
  "(15) Cabasa": "15",
  "(16) Guiro": "16",
  "(17) Vibraslap": "17",
  "(18) Cuica": "18",
  "(1) Piano": "1",
  "(2) Electric Piano": "2",
  "(3) Organ": "3",
  "(4) Guitar": "4",
  "(5) Electric Guitar": "5",
  "(6) Bass": "6",
  "(7) Pizzicato": "7",
  "(8) Cello": "8",
  "(9) Trombone": "9",
  "(10) Clarinet": "10",
  "(11) Saxophone": "11",
  "(12) Flute": "12",
  "(13) Wooden Flute": "13",
  "(14) Bassoon": "14",
  "(15) Choir": "15",
  "(16) Vibraphone": "16",
  "(17) Music Box": "17",
  "(18) Steel Drum": "18",
  "(19) Marimba": "19",
  "(20) Synth Lead": "20",
  "(21) Synth Pad": "21",
  "color": "color",
  "saturation": "saturation",
  "brightness": "brightness",
  "transparency": "transparency",
  "alto": "ALTO",
  "tenor": "TENOR",
  "squeak": "SQUEAK",
  "giant": "GIANT",
  "kitten": "KITTEN",
  "Arabic": "ar",
  "Chinese (Mandarin)": "zh-cn",
  "Danish": "da",
  "Dutch": "nl",
  "English": "en",
  "French": "fr",
  "German": "de",
  "Hindi": "hi",
  "Icelandic": "is",
  "Italian": "it",
  "Japanese": "ja",
  "Korean": "ko",
  "Norwegian": "nb",
  "Polish": "pl",
  "Portuguese (Brazilian)": "pt-br",
  "Portuguese": "pt",
  "Romanian": "ro",
  "Russian": "ru",
  "Spanish": "es",
  "Spanish (Latin American)": "es-419",
  "Swedish": "sv",
  "Turkish": "tr",
  "Welsh": "cy",
  "Amharic": "am",
  "Azerbaijani": "az",
  "Basque": "eu",
  "Bulgarian": "bg",
  "Catalan": "ca",
  "Chinese (Simplified)": "zh-cn",
  "Chinese (Traditional)": "zh-tw",
  "Croatian": "hr",
  "Czech": "cs",
  "Estonian": "et",
  "Finnish": "fi",
  "Galician": "gl",
  "Greek": "el",
  "Hebrew": "he",
  "Hungarian": "hu",
  "Indonesian": "id",
  "Irish Gaelic": "ga",
  "Kurdish (Sorani)": "ckb",
  "Latvian": "lv",
  "Lithuanian": "lt",
  "Maori": "mi",
  "Persian": "fa",
  "Scots Gaelic": "gd",
  "Serbian": "sr",
  "Slovak": "sk",
  "Slovenian": "sl",
  "Thai": "th",
  "Ukrainian": "uk",
  "Vietnamese": "vi",
  "Zulu": "zu",
  "motion": "motion",
  "direction": "direction",
  "sprite": "this sprite",
  "stage": "Stage",
  "on flipped": "on-flipped",
  "motor": "motor",
  "motor A": "motor A",
  "motor B": "motor B",
  "all motors": "all motors",
  "<": "<",
  ">": ">",
  "(0) primary": "0",
  "(1) middle": "1",
  "(2) secondary": "2",
  "mouse-pointer": "_mouse_",
  "random position": "_random_",
  "left-right": "left-right",
  "don't rotate": "don't rotate",
  "all around": "all around",
  "fisheye": "FISHEYE",
  "whirl": "WHIRL",
  "pixelate": "PIXELATE",
  "mosaic": "MOSAIC",
  "ghost": "GHOST",
  "next backdrop": "next backdrop",
  "previous backdrop": "previous backdrop",
  "random backdrop": "random backdrop",
  "forward": "forward",
  "backward": "backward",
  "number": "number",
  "name": "name",
  "pitch": "PITCH",
  "pan": "PAN",
  "loudness": "LOUDNESS",
  "timer": "TIMER",
  "all": "all",
  "this script": "this script",
  "other scripts in sprite": "other scripts in sprite",
  "myself": "_myself_",
  "edge": "_edge_",
  "draggable": "draggable",
  "not draggable": "not draggable",
  "Stage": "_stage_",
  "x position": "x position",
  "y position": "y position",
  "costume #": "costume #",
  "costume name": "costume name",
  "size": "size",
  "volume": "volume",
  "backdrop #": "backdrop #",
  "backdrop name": "backdrop name",
  "year": "YEAR",
  "month": "MONTH",
  "date": "DATE",
  "day of week": "DAYOFWEEK",
  "hour": "HOUR",
  "minute": "MINUTE",
  "second": "SECOND",
  "abs": "abs",
  "floor": "floor",
  "ceiling": "ceiling",
  "sqrt": "sqrt",
  "sin": "sin",
  "cos": "cos",
  "tan": "tan",
  "asin": "asin",
  "acos": "acos",
  "atan": "atan",
  "ln": "ln",
  "log": "log",
  "e ^": "e ^",
  "10 ^": "10 ^",
  "Albanian": "sq",
  "Armenian": "hy",
  "Belarusian": "be",
  "Esperanto": "eo",
  "Haitian Creole": "ht",
  "Irish": "ga",
  "Kannada": "kn",
  "Kurdish (Kurmanji)": "ku",
  "Latin": "la",
  "Macedonian": "mk",
  "Malay": "ms",
  "Malayalam": "ml",
  "Maltese": "mt",
  "Marathi": "mr",
  "Mongolian": "mn",
  "Myanmar (Burmese)": "my",
  "Telugu": "te",
  "Uzbek": "uz",
  "Portuguese (European)": "pt",
  "Spanish (European)": "es"
 },
 "messagePatches": {
  "data_variable": "{VARIABLE}",
  "data_listcontents": "{LIST}",
  "procedures_call": "{PROCEDURES_CALL}",
  "argument_reporter_boolean": "{ARGUMENT_REPORTER_BOOLEAN}",
  "argument_reporter_string_number": "{ARGUMENT_REPORTER_STRING_NUMBER}"
 },
 "sbBlocks": {
  "MOTION_MOVESTEPS": {
   "parts": [
    "move",
    "%1",
    "steps"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_TURNRIGHT": {
   "parts": [
    "turn",
    "@turnRight",
    "%1",
    "degrees"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_TURNLEFT": {
   "parts": [
    "turn",
    "@turnLeft",
    "%1",
    "degrees"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_POINTINDIRECTION": {
   "parts": [
    "point",
    "in",
    "direction",
    "%1"
   ],
   "slotTypes": [
    "%d.direction"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_POINTTOWARDS": {
   "parts": [
    "point",
    "towards",
    "%1"
   ],
   "slotTypes": [
    "%m.spriteOrMouse"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_GOTOXY": {
   "parts": [
    "go",
    "to",
    "x:",
    "%1",
    "y:",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "MOTION_GOTO": {
   "parts": [
    "go",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m.location"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_GLIDESECSTOXY": {
   "parts": [
    "glide",
    "%1",
    "secs",
    "to",
    "x:",
    "%2",
    "y:",
    "%3"
   ],
   "slotTypes": [
    "%n",
    "%n",
    "%n"
   ],
   "shape": "stack",
   "slots": 3
  },
  "MOTION_GLIDETO": {
   "parts": [
    "glide",
    "%1",
    "secs",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%m.location"
   ],
   "shape": "stack",
   "slots": 2
  },
  "MOTION_CHANGEXBY": {
   "parts": [
    "change",
    "x",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_SETX": {
   "parts": [
    "set",
    "x",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_CHANGEYBY": {
   "parts": [
    "change",
    "y",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_SETY": {
   "parts": [
    "set",
    "y",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_SETROTATIONSTYLE": {
   "parts": [
    "set",
    "rotation",
    "style",
    "%1"
   ],
   "slotTypes": [
    "%m.rotationStyle"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_SAYFORSECS": {
   "parts": [
    "say",
    "%1",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%s",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "LOOKS_SAY": {
   "parts": [
    "say",
    "%1"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_THINKFORSECS": {
   "parts": [
    "think",
    "%1",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%s",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "LOOKS_THINK": {
   "parts": [
    "think",
    "%1"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_SHOW": {
   "parts": [
    "show"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_HIDE": {
   "parts": [
    "hide"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_SWITCHCOSTUMETO": {
   "parts": [
    "switch",
    "costume",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m.costume"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_NEXTCOSTUME": {
   "parts": [
    "next",
    "costume"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_NEXTBACKDROP_BLOCK": {
   "parts": [
    "next",
    "backdrop"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_SWITCHBACKDROPTO": {
   "parts": [
    "switch",
    "backdrop",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m.backdrop"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_SWITCHBACKDROPTOANDWAIT": {
   "parts": [
    "switch",
    "backdrop",
    "to",
    "%1",
    "and",
    "wait"
   ],
   "slotTypes": [
    "%m.backdrop"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_CHANGEEFFECTBY": {
   "parts": [
    "change",
    "%1",
    "effect",
    "by",
    "%2"
   ],
   "slotTypes": [
    "%m.effect",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "LOOKS_SETEFFECTTO": {
   "parts": [
    "set",
    "%1",
    "effect",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m.effect",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "LOOKS_CLEARGRAPHICEFFECTS": {
   "parts": [
    "clear",
    "graphic",
    "effects"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_CHANGESIZEBY": {
   "parts": [
    "change",
    "size",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_SETSIZETO": {
   "parts": [
    "set",
    "size",
    "to",
    "%1",
    "%"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "sb2:comeToFront": {
   "parts": [
    "go",
    "to",
    "front"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "LOOKS_GOTOFRONTBACK": {
   "parts": [
    "go",
    "to",
    "%1",
    "layer"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "sb2:goBackByLayers:": {
   "parts": [
    "go",
    "back",
    "%1",
    "layers"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "LOOKS_GOFORWARDBACKWARDLAYERS": {
   "parts": [
    "go",
    "%1",
    "%2",
    "layers"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "SOUND_PLAY": {
   "parts": [
    "start",
    "sound",
    "%1"
   ],
   "slotTypes": [
    "%m.sound"
   ],
   "shape": "stack",
   "slots": 1
  },
  "SOUND_CHANGEEFFECTBY": {
   "parts": [
    "change",
    "%1",
    "effect",
    "by",
    "%2"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "SOUND_SETEFFECTO": {
   "parts": [
    "set",
    "%1",
    "effect",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "SOUND_CLEAREFFECTS": {
   "parts": [
    "clear",
    "sound",
    "effects"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "SOUND_PLAYUNTILDONE": {
   "parts": [
    "play",
    "sound",
    "%1",
    "until",
    "done"
   ],
   "slotTypes": [
    "%m.sound"
   ],
   "shape": "stack",
   "slots": 1
  },
  "SOUND_STOPALLSOUNDS": {
   "parts": [
    "stop",
    "all",
    "sounds"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "music.playDrumForBeats": {
   "parts": [
    "play",
    "drum",
    "%1",
    "for",
    "%2",
    "beats"
   ],
   "slotTypes": [
    "%d.drum",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "music.restForBeats": {
   "parts": [
    "rest",
    "for",
    "%1",
    "beats"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "music.playNoteForBeats": {
   "parts": [
    "play",
    "note",
    "%1",
    "for",
    "%2",
    "beats"
   ],
   "slotTypes": [
    "%d.note",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "music.setInstrument": {
   "parts": [
    "set",
    "instrument",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%d.instrument"
   ],
   "shape": "stack",
   "slots": 1
  },
  "SOUND_CHANGEVOLUMEBY": {
   "parts": [
    "change",
    "volume",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "SOUND_SETVOLUMETO": {
   "parts": [
    "set",
    "volume",
    "to",
    "%1",
    "%"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "music.changeTempo": {
   "parts": [
    "change",
    "tempo",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "sb2:setTempoTo:": {
   "parts": [
    "set",
    "tempo",
    "to",
    "%1",
    "bpm"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "music.setTempo": {
   "parts": [
    "set",
    "tempo",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.clear": {
   "parts": [
    "erase",
    "all"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "pen.stamp": {
   "parts": [
    "stamp"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "pen.penDown": {
   "parts": [
    "pen",
    "down"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "pen.penUp": {
   "parts": [
    "pen",
    "up"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "pen.setColor": {
   "parts": [
    "set",
    "pen",
    "color",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%c"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.changeHue": {
   "parts": [
    "change",
    "pen",
    "color",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.setColorParam": {
   "parts": [
    "set",
    "pen",
    "%1",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m.color",
    "%c"
   ],
   "shape": "stack",
   "slots": 2
  },
  "pen.changeColorParam": {
   "parts": [
    "change",
    "pen",
    "%1",
    "by",
    "%2"
   ],
   "slotTypes": [
    "%m.color",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "pen.setHue": {
   "parts": [
    "set",
    "pen",
    "color",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.changeShade": {
   "parts": [
    "change",
    "pen",
    "shade",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.setShade": {
   "parts": [
    "set",
    "pen",
    "shade",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.changeSize": {
   "parts": [
    "change",
    "pen",
    "size",
    "by",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "pen.setSize": {
   "parts": [
    "set",
    "pen",
    "size",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "EVENT_WHENFLAGCLICKED": {
   "parts": [
    "when",
    "@greenFlag",
    "clicked"
   ],
   "slotTypes": [],
   "shape": "hat",
   "slots": 0
  },
  "EVENT_WHENKEYPRESSED": {
   "parts": [
    "when",
    "%1",
    "key",
    "pressed"
   ],
   "slotTypes": [
    "%m.key"
   ],
   "shape": "hat",
   "slots": 1
  },
  "EVENT_WHENTHISSPRITECLICKED": {
   "parts": [
    "when",
    "this",
    "sprite",
    "clicked"
   ],
   "slotTypes": [],
   "shape": "hat",
   "slots": 0
  },
  "EVENT_WHENSTAGECLICKED": {
   "parts": [
    "when",
    "stage",
    "clicked"
   ],
   "slotTypes": [],
   "shape": "hat",
   "slots": 0
  },
  "EVENT_WHENBACKDROPSWITCHESTO": {
   "parts": [
    "when",
    "backdrop",
    "switches",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m.backdrop"
   ],
   "shape": "hat",
   "slots": 1
  },
  "EVENT_WHENGREATERTHAN": {
   "parts": [
    "when",
    "%1",
    ">",
    "%2"
   ],
   "slotTypes": [
    "%m.triggerSensor",
    "%n"
   ],
   "shape": "hat",
   "slots": 2
  },
  "EVENT_WHENBROADCASTRECEIVED": {
   "parts": [
    "when",
    "I",
    "receive",
    "%1"
   ],
   "slotTypes": [
    "%m.broadcast"
   ],
   "shape": "hat",
   "slots": 1
  },
  "EVENT_BROADCAST": {
   "parts": [
    "broadcast",
    "%1"
   ],
   "slotTypes": [
    "%m.broadcast"
   ],
   "shape": "stack",
   "slots": 1
  },
  "EVENT_BROADCASTANDWAIT": {
   "parts": [
    "broadcast",
    "%1",
    "and",
    "wait"
   ],
   "slotTypes": [
    "%m.broadcast"
   ],
   "shape": "stack",
   "slots": 1
  },
  "CONTROL_WAIT": {
   "parts": [
    "wait",
    "%1",
    "seconds"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "CONTROL_REPEAT": {
   "parts": [
    "repeat",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "c-block",
   "slots": 1
  },
  "CONTROL_FOREVER": {
   "parts": [
    "forever"
   ],
   "slotTypes": [],
   "shape": "c-block cap",
   "slots": 0
  },
  "CONTROL_IF": {
   "parts": [
    "if",
    "%1",
    "then"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "c-block",
   "slots": 1
  },
  "CONTROL_WAITUNTIL": {
   "parts": [
    "wait",
    "until",
    "%1"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "stack",
   "slots": 1
  },
  "CONTROL_REPEATUNTIL": {
   "parts": [
    "repeat",
    "until",
    "%1"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "c-block",
   "slots": 1
  },
  "CONTROL_STOP": {
   "parts": [
    "stop",
    "%1"
   ],
   "slotTypes": [
    "%m.stop"
   ],
   "shape": "cap",
   "slots": 1
  },
  "CONTROL_STARTASCLONE": {
   "parts": [
    "when",
    "I",
    "start",
    "as",
    "a",
    "clone"
   ],
   "slotTypes": [],
   "shape": "hat",
   "slots": 0
  },
  "CONTROL_CREATECLONEOF": {
   "parts": [
    "create",
    "clone",
    "of",
    "%1"
   ],
   "slotTypes": [
    "%m.spriteOnly"
   ],
   "shape": "stack",
   "slots": 1
  },
  "CONTROL_DELETETHISCLONE": {
   "parts": [
    "delete",
    "this",
    "clone"
   ],
   "slotTypes": [],
   "shape": "cap",
   "slots": 0
  },
  "SENSING_ASKANDWAIT": {
   "parts": [
    "ask",
    "%1",
    "and",
    "wait"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "stack",
   "slots": 1
  },
  "videoSensing.videoToggle": {
   "parts": [
    "turn",
    "video",
    "%1"
   ],
   "slotTypes": [
    "%m.videoState"
   ],
   "shape": "stack",
   "slots": 1
  },
  "videoSensing.setVideoTransparency": {
   "parts": [
    "set",
    "video",
    "transparency",
    "to",
    "%1",
    "%"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "videoSensing.whenMotionGreaterThan": {
   "parts": [
    "when",
    "video",
    "motion",
    ">",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "hat",
   "slots": 1
  },
  "SENSING_RESETTIMER": {
   "parts": [
    "reset",
    "timer"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "DATA_SETVARIABLETO": {
   "parts": [
    "set",
    "%1",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m.var",
    "%s"
   ],
   "shape": "stack",
   "slots": 2
  },
  "DATA_CHANGEVARIABLEBY": {
   "parts": [
    "change",
    "%1",
    "by",
    "%2"
   ],
   "slotTypes": [
    "%m.var",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "DATA_SHOWVARIABLE": {
   "parts": [
    "show",
    "variable",
    "%1"
   ],
   "slotTypes": [
    "%m.var"
   ],
   "shape": "stack",
   "slots": 1
  },
  "DATA_HIDEVARIABLE": {
   "parts": [
    "hide",
    "variable",
    "%1"
   ],
   "slotTypes": [
    "%m.var"
   ],
   "shape": "stack",
   "slots": 1
  },
  "DATA_ADDTOLIST": {
   "parts": [
    "add",
    "%1",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%m.list"
   ],
   "shape": "stack",
   "slots": 2
  },
  "DATA_DELETEOFLIST": {
   "parts": [
    "delete",
    "%1",
    "of",
    "%2"
   ],
   "slotTypes": [
    "%d.listDeleteItem",
    "%m.list"
   ],
   "shape": "stack",
   "slots": 2
  },
  "DATA_DELETEALLOFLIST": {
   "parts": [
    "delete",
    "all",
    "of",
    "%1"
   ],
   "slotTypes": [
    "%m.list"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_IFONEDGEBOUNCE": {
   "parts": [
    "if",
    "on",
    "edge,",
    "bounce"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "DATA_INSERTATLIST": {
   "parts": [
    "insert",
    "%1",
    "at",
    "%2",
    "of",
    "%3"
   ],
   "slotTypes": [
    "%s",
    "%d.listItem",
    "%m.list"
   ],
   "shape": "stack",
   "slots": 3
  },
  "DATA_REPLACEITEMOFLIST": {
   "parts": [
    "replace",
    "item",
    "%1",
    "of",
    "%2",
    "with",
    "%3"
   ],
   "slotTypes": [
    "%d.listItem",
    "%m.list",
    "%s"
   ],
   "shape": "stack",
   "slots": 3
  },
  "DATA_SHOWLIST": {
   "parts": [
    "show",
    "list",
    "%1"
   ],
   "slotTypes": [
    "%m.list"
   ],
   "shape": "stack",
   "slots": 1
  },
  "DATA_HIDELIST": {
   "parts": [
    "hide",
    "list",
    "%1"
   ],
   "slotTypes": [
    "%m.list"
   ],
   "shape": "stack",
   "slots": 1
  },
  "MOTION_XPOSITION": {
   "parts": [
    "x",
    "position"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "MOTION_YPOSITION": {
   "parts": [
    "y",
    "position"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "MOTION_DIRECTION": {
   "parts": [
    "direction"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_OF_COSTUMENUMBER": {
   "parts": [
    "costume",
    "#"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "LOOKS_COSTUMENUMBERNAME": {
   "parts": [
    "costume",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "LOOKS_SIZE": {
   "parts": [
    "size"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_OF_BACKDROPNAME": {
   "parts": [
    "backdrop",
    "name"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "LOOKS_BACKDROPNUMBERNAME": {
   "parts": [
    "backdrop",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "SENSING_OF_BACKDROPNUMBER": {
   "parts": [
    "backdrop",
    "#"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SOUND_VOLUME": {
   "parts": [
    "volume"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "music.getTempo": {
   "parts": [
    "tempo"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_TOUCHINGOBJECT": {
   "parts": [
    "touching",
    "%1",
    "?"
   ],
   "slotTypes": [
    "%m.touching"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "SENSING_TOUCHINGCOLOR": {
   "parts": [
    "touching",
    "color",
    "%1",
    "?"
   ],
   "slotTypes": [
    "%c"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "SENSING_COLORISTOUCHINGCOLOR": {
   "parts": [
    "color",
    "%1",
    "is",
    "touching",
    "%2",
    "?"
   ],
   "slotTypes": [
    "%c",
    "%c"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "SENSING_DISTANCETO": {
   "parts": [
    "distance",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m.spriteOrMouse"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "SENSING_ANSWER": {
   "parts": [
    "answer"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_KEYPRESSED": {
   "parts": [
    "key",
    "%1",
    "pressed?"
   ],
   "slotTypes": [
    "%m.key"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "SENSING_MOUSEDOWN": {
   "parts": [
    "mouse",
    "down?"
   ],
   "slotTypes": [],
   "shape": "boolean",
   "slots": 0
  },
  "SENSING_MOUSEX": {
   "parts": [
    "mouse",
    "x"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_MOUSEY": {
   "parts": [
    "mouse",
    "y"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_SETDRAGMODE": {
   "parts": [
    "set",
    "drag",
    "mode",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "SENSING_LOUDNESS": {
   "parts": [
    "loudness"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "videoSensing.videoOn": {
   "parts": [
    "video",
    "%1",
    "on",
    "%2"
   ],
   "slotTypes": [
    "%m.videoMotionType",
    "%m.stageOrThis"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "SENSING_TIMER": {
   "parts": [
    "timer"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_OF": {
   "parts": [
    "%1",
    "of",
    "%2"
   ],
   "slotTypes": [
    "%m.attribute",
    "%m.spriteOrStage"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "SENSING_CURRENT": {
   "parts": [
    "current",
    "%1"
   ],
   "slotTypes": [
    "%m.timeAndDate"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "SENSING_DAYSSINCE2000": {
   "parts": [
    "days",
    "since",
    "2000"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_ONLINE": {
   "parts": [
    "online?"
   ],
   "slotTypes": [],
   "shape": "boolean",
   "slots": 0
  },
  "SENSING_USERNAME": {
   "parts": [
    "username"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "OPERATORS_ADD": {
   "parts": [
    "%1",
    "+",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_SUBTRACT": {
   "parts": [
    "%1",
    "-",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_MULTIPLY": {
   "parts": [
    "%1",
    "*",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_DIVIDE": {
   "parts": [
    "%1",
    "/",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_RANDOM": {
   "parts": [
    "pick",
    "random",
    "%1",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_LT": {
   "parts": [
    "%1",
    "<",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%s"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "OPERATORS_EQUALS": {
   "parts": [
    "%1",
    "=",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%s"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "OPERATORS_GT": {
   "parts": [
    "%1",
    ">",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%s"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "OPERATORS_AND": {
   "parts": [
    "%1",
    "and",
    "%2"
   ],
   "slotTypes": [
    "%b",
    "%b"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "OPERATORS_OR": {
   "parts": [
    "%1",
    "or",
    "%2"
   ],
   "slotTypes": [
    "%b",
    "%b"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "OPERATORS_NOT": {
   "parts": [
    "not",
    "%1"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "OPERATORS_JOIN": {
   "parts": [
    "join",
    "%1",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%s"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_LETTEROF": {
   "parts": [
    "letter",
    "%1",
    "of",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%s"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_LENGTH": {
   "parts": [
    "length",
    "of",
    "%1"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "OPERATORS_MOD": {
   "parts": [
    "%1",
    "mod",
    "%2"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_ROUND": {
   "parts": [
    "round",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "OPERATORS_MATHOP": {
   "parts": [
    "%1",
    "of",
    "%2"
   ],
   "slotTypes": [
    "%m.mathOp",
    "%n"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "OPERATORS_CONTAINS": {
   "parts": [
    "%1",
    "contains",
    "%2",
    "?"
   ],
   "slotTypes": [
    "%s",
    "%s"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "DATA_ITEMOFLIST": {
   "parts": [
    "item",
    "%1",
    "of",
    "%2"
   ],
   "slotTypes": [
    "%d.listItem",
    "%m.list"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "DATA_ITEMNUMOFLIST": {
   "parts": [
    "item",
    "#",
    "of",
    "%1",
    "in",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%m.list"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "DATA_LENGTHOFLIST": {
   "parts": [
    "length",
    "of",
    "%1"
   ],
   "slotTypes": [
    "%m.list"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "DATA_LISTCONTAINSITEM": {
   "parts": [
    "%1",
    "contains",
    "%2",
    "?"
   ],
   "slotTypes": [
    "%m.list",
    "%s"
   ],
   "shape": "boolean",
   "slots": 2
  },
  "CONTROL_ELSE": {
   "parts": [
    "else"
   ],
   "slotTypes": [],
   "shape": "celse",
   "slots": 0
  },
  "scratchblocks:end": {
   "parts": [
    "end"
   ],
   "slotTypes": [],
   "shape": "cend",
   "slots": 0
  },
  "scratchblocks:ellipsis": {
   "parts": [
    ".",
    ".",
    "."
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "scratchblocks:addInput": {
   "parts": [
    "%1",
    "@addInput"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "ring",
   "slots": 1
  },
  "SENSING_USERID": {
   "parts": [
    "user",
    "id"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "sb2:doIf": {
   "parts": [
    "if",
    "%1"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "c-block",
   "slots": 1
  },
  "sb2:doForeverIf": {
   "parts": [
    "forever",
    "if",
    "%1"
   ],
   "slotTypes": [
    "%b"
   ],
   "shape": "c-block cap",
   "slots": 1
  },
  "sb2:doReturn": {
   "parts": [
    "stop",
    "script"
   ],
   "slotTypes": [],
   "shape": "cap",
   "slots": 0
  },
  "sb2:stopAll": {
   "parts": [
    "stop",
    "all"
   ],
   "slotTypes": [],
   "shape": "cap",
   "slots": 0
  },
  "sb2:lookLike:": {
   "parts": [
    "switch",
    "to",
    "costume",
    "%1"
   ],
   "slotTypes": [
    "%m.costume"
   ],
   "shape": "stack",
   "slots": 1
  },
  "sb2:nextScene": {
   "parts": [
    "next",
    "background"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "sb2:startScene": {
   "parts": [
    "switch",
    "to",
    "background",
    "%1"
   ],
   "slotTypes": [
    "%m.backdrop"
   ],
   "shape": "stack",
   "slots": 1
  },
  "sb2:backgroundIndex": {
   "parts": [
    "background",
    "#"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "SENSING_LOUD": {
   "parts": [
    "loud?"
   ],
   "slotTypes": [],
   "shape": "boolean",
   "slots": 0
  },
  "faceSensing.goToPart": {
   "parts": [
    "go",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "faceSensing.pointInFaceTiltDirection": {
   "parts": [
    "point",
    "in",
    "direction",
    "of",
    "face",
    "tilt"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "faceSensing.setSizeToFaceSize": {
   "parts": [
    "set",
    "size",
    "to",
    "face",
    "size"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "faceSensing.whenTilted": {
   "parts": [
    "when",
    "face",
    "tilts",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "faceSensing.whenSpriteTouchesPart": {
   "parts": [
    "when",
    "this",
    "sprite",
    "touches",
    "a",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "faceSensing.whenFaceDetected": {
   "parts": [
    "when",
    "a",
    "face",
    "is",
    "detected"
   ],
   "slotTypes": [],
   "shape": "hat",
   "slots": 0
  },
  "faceSensing.faceDetected": {
   "parts": [
    "a",
    "face",
    "is",
    "detected?"
   ],
   "slotTypes": [],
   "shape": "boolean",
   "slots": 0
  },
  "faceSensing.faceTilt": {
   "parts": [
    "face",
    "tilt"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "faceSensing.faceSize": {
   "parts": [
    "face",
    "size"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "text2speech.speakAndWaitBlock": {
   "parts": [
    "speak",
    "%1"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "stack",
   "slots": 1
  },
  "text2speech.setVoiceBlock": {
   "parts": [
    "set",
    "voice",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "text2speech.setLanguageBlock": {
   "parts": [
    "set",
    "language",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "translate.translateBlock": {
   "parts": [
    "translate",
    "%1",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%s",
    "%m"
   ],
   "shape": "reporter",
   "slots": 2
  },
  "translate.viewerLanguage": {
   "parts": [
    "language"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "makeymakey.whenKeyPressed": {
   "parts": [
    "when",
    "%1",
    "key",
    "pressed"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "makeymakey.whenKeysPressedInOrder": {
   "parts": [
    "when",
    "%1",
    "pressed",
    "in",
    "order"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "microbit.whenButtonPressed": {
   "parts": [
    "when",
    "%1",
    "button",
    "pressed"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "microbit.isButtonPressed": {
   "parts": [
    "%1",
    "button",
    "pressed?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "microbit.whenGesture": {
   "parts": [
    "when",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "microbit.displaySymbol": {
   "parts": [
    "display",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "microbit.displayText": {
   "parts": [
    "display",
    "text",
    "%1"
   ],
   "slotTypes": [
    "%s"
   ],
   "shape": "stack",
   "slots": 1
  },
  "microbit.clearDisplay": {
   "parts": [
    "clear",
    "display"
   ],
   "slotTypes": [],
   "shape": "stack",
   "slots": 0
  },
  "microbit.whenTilted": {
   "parts": [
    "when",
    "tilted",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "microbit.isTilted": {
   "parts": [
    "tilted",
    "%1",
    "?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "microbit.tiltAngle": {
   "parts": [
    "tilt",
    "angle",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "microbit.whenPinConnected": {
   "parts": [
    "when",
    "pin",
    "%1",
    "connected"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "ev3.motorTurnClockwise": {
   "parts": [
    "motor",
    "%1",
    "turn",
    "this",
    "way",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "ev3.motorTurnCounterClockwise": {
   "parts": [
    "motor",
    "%1",
    "turn",
    "that",
    "way",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "ev3.motorSetPower": {
   "parts": [
    "motor",
    "%1",
    "set",
    "power",
    "%2",
    "%"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "ev3.getMotorPosition": {
   "parts": [
    "motor",
    "%1",
    "position"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "ev3.whenButtonPressed": {
   "parts": [
    "when",
    "button",
    "%1",
    "pressed"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "ev3.whenDistanceLessThan": {
   "parts": [
    "when",
    "distance",
    "<",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "hat",
   "slots": 1
  },
  "ev3.whenBrightnessLessThan": {
   "parts": [
    "when",
    "brightness",
    "<",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "hat",
   "slots": 1
  },
  "ev3.buttonPressed": {
   "parts": [
    "button",
    "%1",
    "pressed?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "ev3.getDistance": {
   "parts": [
    "distance"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "ev3.getBrightness": {
   "parts": [
    "brightness"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "ev3.beepNote": {
   "parts": [
    "beep",
    "note",
    "%1",
    "for",
    "%2",
    "secs"
   ],
   "slotTypes": [
    "%d.note",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "wedo2.motorOn": {
   "parts": [
    "turn",
    "%1",
    "on"
   ],
   "slotTypes": [
    "%m.motor"
   ],
   "shape": "stack",
   "slots": 1
  },
  "wedo2.motorOff": {
   "parts": [
    "turn",
    "%1",
    "off"
   ],
   "slotTypes": [
    "%m.motor"
   ],
   "shape": "stack",
   "slots": 1
  },
  "wedo2.startMotorPower": {
   "parts": [
    "set",
    "%1",
    "power",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m.motor",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "wedo2.setMotorDirection": {
   "parts": [
    "set",
    "%1",
    "direction",
    "to",
    "%2"
   ],
   "slotTypes": [
    "%m.motor2",
    "%m.motorDirection"
   ],
   "shape": "stack",
   "slots": 2
  },
  "wedo2.whenDistance": {
   "parts": [
    "when",
    "distance",
    "%1",
    "%2"
   ],
   "slotTypes": [
    "%m.lessMore",
    "%n"
   ],
   "shape": "hat",
   "slots": 2
  },
  "wedo2.getDistance": {
   "parts": [
    "distance"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "wedo2.motorOnFor": {
   "parts": [
    "turn",
    "%1",
    "on",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%m.motor",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "wedo2.setLightHue": {
   "parts": [
    "set",
    "light",
    "color",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  },
  "wedo2.playNoteFor": {
   "parts": [
    "play",
    "note",
    "%1",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%n",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "wedo2.whenTilted": {
   "parts": [
    "when",
    "tilted",
    "%1"
   ],
   "slotTypes": [
    "%m.xxx"
   ],
   "shape": "hat",
   "slots": 1
  },
  "wedo2.isTilted": {
   "parts": [
    "tilted",
    "%1",
    "?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "wedo2.getTiltAngle": {
   "parts": [
    "tilt",
    "angle",
    "%1"
   ],
   "slotTypes": [
    "%m.xxx"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "gdxfor.whenGesture": {
   "parts": [
    "when",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "gdxfor.whenForcePushedOrPulled": {
   "parts": [
    "when",
    "force",
    "sensor",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "gdxfor.getForce": {
   "parts": [
    "force"
   ],
   "slotTypes": [],
   "shape": "reporter",
   "slots": 0
  },
  "gdxfor.whenTilted": {
   "parts": [
    "when",
    "tilted",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "gdxfor.isTilted": {
   "parts": [
    "tilted",
    "%1",
    "?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "gdxfor.getTilt": {
   "parts": [
    "tilt",
    "angle",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "gdxfor.isFreeFalling": {
   "parts": [
    "falling?"
   ],
   "slotTypes": [],
   "shape": "boolean",
   "slots": 0
  },
  "gdxfor.getSpin": {
   "parts": [
    "spin",
    "speed",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "gdxfor.getAcceleration": {
   "parts": [
    "acceleration",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "boost.motorOnFor": {
   "parts": [
    "turn",
    "motor",
    "%1",
    "for",
    "%2",
    "seconds"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "boost.motorOnForRotation": {
   "parts": [
    "turn",
    "motor",
    "%1",
    "for",
    "%2",
    "rotations"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "boost.motorOn": {
   "parts": [
    "turn",
    "motor",
    "%1",
    "on"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "boost.motorOff": {
   "parts": [
    "turn",
    "motor",
    "%1",
    "off"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "stack",
   "slots": 1
  },
  "boost.setMotorPower": {
   "parts": [
    "set",
    "motor",
    "%1",
    "speed",
    "to",
    "%2",
    "%"
   ],
   "slotTypes": [
    "%m",
    "%n"
   ],
   "shape": "stack",
   "slots": 2
  },
  "boost.setMotorDirection": {
   "parts": [
    "set",
    "motor",
    "%1",
    "direction",
    "%2"
   ],
   "slotTypes": [
    "%m",
    "%m"
   ],
   "shape": "stack",
   "slots": 2
  },
  "boost.getMotorPosition": {
   "parts": [
    "motor",
    "%1",
    "position"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "boost.whenColor": {
   "parts": [
    "when",
    "%1",
    "brick",
    "seen"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "boost.seeingColor": {
   "parts": [
    "seeing",
    "%1",
    "brick?"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "boolean",
   "slots": 1
  },
  "boost.whenTilted": {
   "parts": [
    "when",
    "tilted",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "hat",
   "slots": 1
  },
  "boost.getTiltAngle": {
   "parts": [
    "tilt",
    "angle",
    "%1"
   ],
   "slotTypes": [
    "%m"
   ],
   "shape": "reporter",
   "slots": 1
  },
  "boost.setLightHue": {
   "parts": [
    "set",
    "light",
    "color",
    "to",
    "%1"
   ],
   "slotTypes": [
    "%n"
   ],
   "shape": "stack",
   "slots": 1
  }
 }
};
