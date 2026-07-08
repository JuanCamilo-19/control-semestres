from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)
CORS(app) # Permite que tu Node.js (puerto 3000) se comunique con Python (puerto 5000)

# Configuración de la base de datos
db_config = {
    'host': os.getenv('DB_HOST'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
    'port': int(os.getenv('DB_PORT')),
    'pool_name': 'chatbot_pool',
    'pool_size': 5
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**db_config)
        return connection
    except Error as e:
        print(f"Error conectando a MariaDB: {e}")
        return None

# ==========================================
# RUTAS DEL CHATBOT
# ==========================================

@app.route('/test', methods=['GET'])
def test():
    return jsonify({"mensaje": "¡El microservicio Python de CORPOBOL está funcionando!"})

@app.route('/chatbot/categorias', methods=['GET'])
def obtener_categorias():
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Error de conexión"}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM chatbot_categorias WHERE activa = TRUE ORDER BY orden")
        categorias = cursor.fetchall()
        return jsonify(categorias)
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/chatbot/pregunta', methods=['POST'])
def responder_pregunta():
    data = request.json
    if not data or 'pregunta' not in data:
        return jsonify({"error": "Falta la pregunta"}), 400
    
    pregunta_usuario = data['pregunta'].lower().strip()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Error de conexión"}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Buscar respuestas activas cuyas palabras clave coincidan
        # Usamos LIKE para buscar coincidencias parciales
        cursor.execute("""
            SELECT id, respuesta, tipo, link_accion, palabras_clave 
            FROM chatbot_respuestas 
            WHERE activa = TRUE
            ORDER BY orden ASC
        """)
        respuestas = cursor.fetchall()
        
        respuesta_encontrada = None
        
        # Lógica simple de coincidencia de palabras clave
        for resp in respuestas:
            palabras_clave = resp['palabras_clave'].lower().split(',')
            for palabra in palabras_clave:
                if palabra.strip() in pregunta_usuario:
                    respuesta_encontrada = resp
                    break
            if respuesta_encontrada:
                break
        
        if respuesta_encontrada:
            # Registrar en los logs y actualizar contador
            cursor.execute("""
                UPDATE chatbot_respuestas 
                SET veces_consultada = veces_consultada + 1 
                WHERE id = %s
            """, (respuesta_encontrada['id'],))
            
            cursor.execute("""
                INSERT INTO chatbot_logs (pregunta_usuario, respuesta_id, fue_util)
                VALUES (%s, %s, NULL)
            """, (pregunta_usuario, respuesta_encontrada['id']))
            
            conn.commit()
            
            return jsonify({
                "encontrado": True,
                "respuesta": respuesta_encontrada['respuesta'],
                "tipo": respuesta_encontrada['tipo'],
                "link": respuesta_encontrada['link_accion']
            })
        else:
            # Si no encuentra nada, guardar el log de pregunta fallida
            cursor.execute("""
                INSERT INTO chatbot_logs (pregunta_usuario, respuesta_id, fue_util)
                VALUES (%s, NULL, 0)
            """, (pregunta_usuario,))
            conn.commit()
            
            return jsonify({
                "encontrado": False,
                "respuesta": "Lo siento, no encontré información específica sobre eso. ¿Podrías reformular tu pregunta o intentar con palabras clave como 'estudiante', 'semestre' o 'ayuda'?"
            })
            
    except Error as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

# ==========================================
# INICIAR SERVIDOR
# ==========================================
if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    print(f" Iniciando Chatbot CORPOBOL en http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)