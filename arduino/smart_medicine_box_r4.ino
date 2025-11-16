/*
 * 스마트 약통 시스템 - Arduino R4 WiFi
 * 
 * 하드웨어:
 * - Arduino R4 WiFi (Renesas RA4M1 + ESP32-S3)
 * - 적외선 센서 7개 (디지털 핀 2-8)
 * - LED 7개 (디지털 핀 9-15)
 * - 부저 1개 (디지털 핀 16)
 */

#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

// WiFi 설정
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// 서버 설정
const char* serverAddress = "port-0-coss-mi0kk25df8c7e306.sel3.cloudtype.app";
const int serverPort = 443; // HTTPS
const char* boxCode = "BOX001"; // 각 약통의 고유 코드

// 핀 설정
const int IR_SENSORS[7] = {2, 3, 4, 5, 6, 7, 8};
const int LED_PINS[7] = {9, 10, 11, 12, 13, 14, 15};
const int BUZZER_PIN = 16;

// 상태 변수
bool previousSensorState[7] = {false};
bool currentSensorState[7] = {false};
bool compartmentActive[7] = {false};
unsigned long lastCheckTime[7] = {0};
unsigned long lastServerSync = 0;

const unsigned long DEBOUNCE_DELAY = 50;
const unsigned long SERVER_SYNC_INTERVAL = 30000;
const unsigned long SENSOR_CHECK_INTERVAL = 100;

WiFiSSLClient wifi;
HttpClient client = HttpClient(wifi, serverAddress, serverPort);

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=================================");
  Serial.println("스마트 약통 시스템 시작");
  Serial.println("Arduino R4 WiFi");
  Serial.println("=================================");
  
  // 핀 모드 설정
  for (int i = 0; i < 7; i++) {
    pinMode(IR_SENSORS[i], INPUT);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LOW);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  
  // WiFi 연결
  connectWiFi();
  
  // 초기 상태 읽기
  for (int i = 0; i < 7; i++) {
    previousSensorState[i] = digitalRead(IR_SENSORS[i]);
  }
  
  playStartupSound();
  blinkAllLEDs(3);
  
  sendDeviceStatus("online");
  Serial.println("시스템 준비 완료!");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi 연결 끊김. 재연결 시도...");
    connectWiFi();
  }
  
  checkSensors();
  
  if (millis() - lastServerSync > SERVER_SYNC_INTERVAL) {
    syncWithServer();
    lastServerSync = millis();
  }
  
  delay(SENSOR_CHECK_INTERVAL);
}

void connectWiFi() {
  Serial.print("WiFi 연결 중: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_PINS[0], !digitalRead(LED_PINS[0]));
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi 연결 성공!");
    Serial.print("IP 주소: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PINS[0], LOW);
  } else {
    Serial.println("\n❌ WiFi 연결 실패!");
    for (int i = 0; i < 5; i++) {
      tone(BUZZER_PIN, 1000, 100);
      delay(200);
    }
  }
}

void checkSensors() {
  unsigned long currentTime = millis();
  
  for (int i = 0; i < 7; i++) {
    if (currentTime - lastCheckTime[i] < DEBOUNCE_DELAY) {
      continue;
    }
    
    currentSensorState[i] = digitalRead(IR_SENSORS[i]);
    
    // 약통 열림 감지 (LOW -> HIGH)
    if (currentSensorState[i] == HIGH && previousSensorState[i] == LOW) {
      Serial.print("📦 약통 ");
      Serial.print(i + 1);
      Serial.println("번 칸 열림 감지!");
      
      digitalWrite(LED_PINS[i], HIGH);
      tone(BUZZER_PIN, 2000, 100);
      sendSensorData(i + 1, "open");
      lastCheckTime[i] = currentTime;
    }
    // 약통 닫힘 감지 (HIGH -> LOW)
    else if (currentSensorState[i] == LOW && previousSensorState[i] == HIGH) {
      Serial.print("📦 약통 ");
      Serial.print(i + 1);
      Serial.println("번 칸 닫힘");
      
      digitalWrite(LED_PINS[i], LOW);
      sendSensorData(i + 1, "close");
      lastCheckTime[i] = currentTime;
    }
    
    previousSensorState[i] = currentSensorState[i];
  }
}

void sendSensorData(int compartment, String eventType) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi 연결 안됨. 데이터 전송 실패");
    return;
  }
  
  StaticJsonDocument<256> doc;
  doc["box_code"] = boxCode;
  doc["compartment_number"] = compartment;
  doc["event_type"] = eventType;
  doc["sensor_value"] = analogRead(A0);
  doc["timestamp"] = millis();
  
  String jsonData;
  serializeJson(doc, jsonData);
  
  Serial.print("📤 서버로 데이터 전송: ");
  Serial.println(jsonData);
  
  client.beginRequest();
  client.post("/api/arduino/sensor-data");
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("Content-Length", jsonData.length());
  client.sendHeader("X-Box-Code", boxCode);
  client.beginBody();
  client.print(jsonData);
  client.endRequest();
  
  int statusCode = client.responseStatusCode();
  String response = client.responseBody();
  
  Serial.print("응답 코드: ");
  Serial.println(statusCode);
  
  if (statusCode == 200) {
    Serial.println("✅ 데이터 전송 성공");
    blinkLED(compartment - 1, 2);
  } else {
    Serial.println("❌ 데이터 전송 실패");
    tone(BUZZER_PIN, 500, 500);
  }
}

void syncWithServer() {
  Serial.println("🔄 서버와 동기화 중...");
  
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  client.beginRequest();
  client.get("/api/arduino/next-doses/" + String(boxCode));
  client.sendHeader("Accept", "application/json");
  client.endRequest();
  
  int statusCode = client.responseStatusCode();
  String response = client.responseBody();
  
  if (statusCode == 200) {
    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      JsonArray doses = doc["doses"];
      
      for (int i = 0; i < 7; i++) {
        compartmentActive[i] = false;
        digitalWrite(LED_PINS[i], LOW);
      }
      
      for (JsonObject dose : doses) {
        int compartment = dose["compartment_number"];
        if (compartment >= 1 && compartment <= 7) {
          compartmentActive[compartment - 1] = true;
          digitalWrite(LED_PINS[compartment - 1], HIGH);
          
          Serial.print("💊 ");
          Serial.print(compartment);
          Serial.print("번 칸: ");
          Serial.println(dose["medicine_name"].as<String>());
        }
      }
      
      if (doses.size() > 0) {
        playMedicineAlarm();
      }
    }
  }
}

void sendDeviceStatus(String status) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  StaticJsonDocument<256> doc;
  doc["box_code"] = boxCode;
  doc["status"] = status;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["firmware_version"] = "1.0.0";
  doc["uptime"] = millis();
  
  String jsonData;
  serializeJson(doc, jsonData);
  
  client.beginRequest();
  client.post("/api/arduino/device-status");
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("Content-Length", jsonData.length());
  client.beginBody();
  client.print(jsonData);
  client.endRequest();
}

void playStartupSound() {
  tone(BUZZER_PIN, 523, 100);
  delay(100);
  tone(BUZZER_PIN, 659, 100);
  delay(100);
  tone(BUZZER_PIN, 784, 100);
  delay(100);
  tone(BUZZER_PIN, 1047, 200);
}

void playMedicineAlarm() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1000, 200);
    delay(200);
    tone(BUZZER_PIN, 1500, 200);
    delay(200);
  }
}

void blinkLED(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PINS[pin], HIGH);
    delay(100);
    digitalWrite(LED_PINS[pin], LOW);
    delay(100);
  }
}

void blinkAllLEDs(int times) {
  for (int i = 0; i < times; i++) {
    for (int j = 0; j < 7; j++) {
      digitalWrite(LED_PINS[j], HIGH);
    }
    delay(200);
    for (int j = 0; j < 7; j++) {
      digitalWrite(LED_PINS[j], LOW);
    }
    delay(200);
  }
}

// 시리얼 명령 처리 (테스트용)
void serialEvent() {
  while (Serial.available()) {
    char command = Serial.read();
    
    switch (command) {
      case 't': // 테스트 모드
        Serial.println("테스트 모드 실행");
        testAllComponents();
        break;
      case 's': // 상태 확인
        printStatus();
        break;
      case 'r': // 리셋
        Serial.println("시스템 리셋...");
        delay(1000);
        asm volatile ("jmp 0");
        break;
    }
  }
}

void testAllComponents() {
  Serial.println("=== 컴포넌트 테스트 ===");
  Serial.println("LED 테스트...");
  for (int i = 0; i < 7; i++) {
    digitalWrite(LED_PINS[i], HIGH);
    delay(200);
    digitalWrite(LED_PINS[i], LOW);
  }
  Serial.println("부저 테스트...");
  playStartupSound();
  Serial.println("센서 상태:");
  for (int i = 0; i < 7; i++) {
    Serial.print("센서 ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.println(digitalRead(IR_SENSORS[i]) ? "HIGH" : "LOW");
  }
  Serial.println("테스트 완료!");
}

void printStatus() {
  Serial.println("=== 시스템 상태 ===");
  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "연결됨" : "연결 안됨");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Box Code: ");
  Serial.println(boxCode);
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" 초");
}